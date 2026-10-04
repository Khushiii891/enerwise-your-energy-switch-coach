import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildRecommendation, pickAutoSwitch } from "./calc";
import { contractFromRow, controlFromRow, loadOffers, usageFromRow } from "./db-mappers";
import { DEFAULT_CONTROL } from "./market-data";
import { PROMPT_VERSION, staticExplanation } from "./rationale.functions";
import type { MarketOffer } from "./types";

type Admin = SupabaseClient<Database>;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface RecalcOutcome {
  userId: string;
  recommendationId: string | null;
  decision: "switch_now" | "wait" | null;
  bestSupplier: string | null;
}

/**
 * Re-run the deterministic calculation for one user with the admin client.
 * Never calls the LLM: the recommendation gets the standard static explanation
 * (model "static"). In automatic mode it also advances the simulated switch.
 */
export async function recalcUser(admin: Admin, userId: string, offers: MarketOffer[], createdAt?: string): Promise<RecalcOutcome> {
  const [c, u, cs, ps] = await Promise.all([
    admin.from("contracts").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("usage").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("control_settings").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("planned_switches").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!c.data || !u.data) return { userId, recommendationId: null, decision: null, bestSupplier: null };
  const contract = contractFromRow(c.data);
  const rec = buildRecommendation(contract, usageFromRow(u.data), offers);
  const decision = rec.shouldSwitch ? "switch_now" : "wait";

  const { data: saved, error } = await admin
    .from("recommendations")
    .insert({
      user_id: userId,
      current_supplier: contract.supplier,
      best_supplier: rec.best?.offer.supplier ?? null,
      net_savings: rec.best ? r2(rec.best.netSavings) : null,
      decision,
      rationale_text: staticExplanation(rec),
      model: "static",
      prompt_version: PROMPT_VERSION,
      lang: "en",
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`recommendation insert failed: ${error.message}`);

  // Simulated automatic mode — same rules as the in-app engine.
  const control = cs.data ? controlFromRow(cs.data) : DEFAULT_CONTROL;
  if (control.mode === "auto") {
    const s = ps.data;
    if (s?.status === "planned" && new Date(s.planned_date).getTime() <= Date.now()) {
      await admin.from("planned_switches").update({ status: "completed" }).eq("id", s.id).eq("status", "planned");
    } else if (!s || s.status === "cancelled") {
      const auto = pickAutoSwitch(rec, control);
      if (auto && !(s?.status === "cancelled" && s.supplier === auto.offer.supplier)) {
        await admin.from("planned_switches").insert({
          user_id: userId,
          supplier: auto.offer.supplier,
          net_savings: r2(auto.netSavings),
          planned_date: new Date(Date.now() + control.cancelWindowDays * 86400000).toISOString(),
        });
      }
    }
  }
  return { userId, recommendationId: saved.id, decision, bestSupplier: rec.best?.offer.supplier ?? null };
}

/** Rerun for every user who has saved a contract and usage (sequential: bounded outbound connections). */
export async function recalcAllUsers(admin: Admin): Promise<RecalcOutcome[]> {
  const offers = await loadOffers(admin);
  const { data } = await admin.from("contracts").select("user_id").limit(5000);
  const out: RecalcOutcome[] = [];
  for (const row of data ?? []) {
    try {
      out.push(await recalcUser(admin, row.user_id, offers));
    } catch (e) {
      console.error("recalc failed for", row.user_id, e);
    }
  }
  return out;
}

/**
 * Delete and recreate recommendations + planned switches for demo users.
 * Existing demo feedback is kept and re-attached to each user's new recommendation.
 */
export async function recalcDemo(admin: Admin): Promise<RecalcOutcome[]> {
  const { data: demos } = await admin.from("demo_households").select("user_id");
  const ids = (demos ?? []).map((d) => d.user_id);
  if (!ids.length) return [];
  const { data: fb } = await admin.from("feedback").select("user_id, helpful, comment, created_at").in("user_id", ids);
  await admin.from("planned_switches").delete().in("user_id", ids);
  await admin.from("recommendations").delete().in("user_id", ids); // cascades to feedback
  const offers = await loadOffers(admin);
  const out: RecalcOutcome[] = [];
  for (const id of ids) {
    const mine = (fb ?? []).filter((f) => f.user_id === id);
    // Keep the timeline plausible: recommendation an hour before the earliest feedback.
    const first = mine.map((f) => f.created_at).sort()[0];
    const createdAt = first ? new Date(new Date(first).getTime() - 3600000).toISOString() : undefined;
    const r = await recalcUser(admin, id, offers, createdAt);
    out.push(r);
    if (r.recommendationId && mine.length) {
      await admin.from("feedback").insert(
        mine.map((f) => ({ recommendation_id: r.recommendationId!, user_id: id, helpful: f.helpful, comment: f.comment, created_at: f.created_at })),
      );
    }
  }
  return out;
}
