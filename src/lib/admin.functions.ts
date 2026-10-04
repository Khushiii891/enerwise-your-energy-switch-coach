import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminRow {
  id: string;
  created_at: string;
  user_id: string;
  current_supplier: string | null;
  best_supplier: string | null;
  net_savings: number | null;
  decision: string;
  headline: string;
  rationale: string;
  caveat: string;
  model: string;
  prompt_version: string;
  is_demo: boolean;
  household_id: string | null;
  persona: string | null;
  customer_type: string | null;
  feedback: { helpful: boolean; comment: string | null; created_at: string }[];
}

export const listAdminRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().nullable(),
        to: z.string().nullable(),
        decision: z.enum(["all", "switch_now", "wait"]),
        customerType: z.string().max(100).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<AdminRow[]> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    let q = supabase
      .from("recommendations")
      .select("*, feedback(helpful, comment, created_at)")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);
    if (data.decision !== "all") q = q.eq("decision", data.decision);
    const { data: demos } = await supabase.from("demo_households").select("*");
    const demoBy = new Map((demos ?? []).map((d) => [d.user_id, d]));
    if (data.customerType) {
      const ids = (demos ?? []).filter((d) => d.customer_type === data.customerType).map((d) => d.user_id);
      q = q.in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
    const { data: rows, error } = await q;
    if (error) {
      console.error(error);
      throw new Error("Could not load recommendations");
    }
    return (rows ?? []).map((r) => {
      const rt = (r.rationale_text ?? {}) as { headline?: string; rationale?: string; caveat?: string };
      return {
        id: r.id,
        created_at: r.created_at,
        user_id: r.user_id,
        current_supplier: r.current_supplier,
        best_supplier: r.best_supplier,
        net_savings: r.net_savings === null ? null : Number(r.net_savings),
        decision: r.decision,
        headline: rt.headline ?? "",
        rationale: rt.rationale ?? "",
        caveat: rt.caveat ?? "",
        model: r.model,
        prompt_version: r.prompt_version,
        is_demo: demoBy.has(r.user_id),
        household_id: demoBy.get(r.user_id)?.household_id ?? null,
        persona: demoBy.get(r.user_id)?.persona ?? null,
        customer_type: demoBy.get(r.user_id)?.customer_type ?? null,
        feedback: (r.feedback ?? []).map((f) => ({
          helpful: f.helpful,
          comment: f.comment,
          created_at: f.created_at,
        })),
      };
    });
  });

export interface AdminControlRow {
  user_id: string;
  mode: string;
  min_savings: number;
  allowed_types: string[];
  excluded_suppliers: string[];
  cancel_window_days: number;
  created_at: string;
}
export interface AdminSwitchRow {
  id: string;
  user_id: string;
  supplier: string;
  net_savings: number;
  planned_date: string;
  status: string;
  cancelled_at: string | null;
  created_at: string;
}

export const listAdminControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ settings: AdminControlRow[]; switches: AdminSwitchRow[] }> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const [s, p] = await Promise.all([
      supabase.from("control_settings").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("planned_switches").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    if (s.error || p.error) throw new Error("Could not load control data");
    return {
      settings: (s.data ?? []).map((r) => ({
        user_id: r.user_id, mode: r.mode, min_savings: Number(r.min_savings),
        allowed_types: r.allowed_types ?? [], excluded_suppliers: r.excluded_suppliers ?? [],
        cancel_window_days: r.cancel_window_days, created_at: r.created_at,
      })),
      switches: (p.data ?? []).map((r) => ({
        id: r.id, user_id: r.user_id, supplier: r.supplier, net_savings: Number(r.net_savings),
        planned_date: r.planned_date, status: r.status, cancelled_at: r.cancelled_at, created_at: r.created_at,
      })),
    };
  });

async function assertAdmin(supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Admin: explain one existing recommendation with the AI (numbers recomputed, then number-checked). */
export const generateAdminRationale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ recommendationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { contractFromRow, controlFromRow, loadOffers, usageFromRow } = await import("./db-mappers");
    const { buildPayload, explainWithAI, PROMPT_VERSION } = await import("./rationale.functions");
    const { DEFAULT_CONTROL } = await import("./market-data");
    const { data: row } = await supabaseAdmin.from("recommendations").select("user_id, lang").eq("id", data.recommendationId).maybeSingle();
    if (!row) throw new Error("Recommendation not found");
    const [c, u, cs, offers] = await Promise.all([
      supabaseAdmin.from("contracts").select("*").eq("user_id", row.user_id).maybeSingle(),
      supabaseAdmin.from("usage").select("*").eq("user_id", row.user_id).maybeSingle(),
      supabaseAdmin.from("control_settings").select("*").eq("user_id", row.user_id).maybeSingle(),
      loadOffers(supabaseAdmin),
    ]);
    if (!c.data || !u.data) throw new Error("This household has no saved contract or usage");
    const lang = row.lang === "nl" ? "nl" : "en";
    const { rec, decision, payload } = buildPayload(
      contractFromRow(c.data), usageFromRow(u.data), cs.data ? controlFromRow(cs.data) : DEFAULT_CONTROL, offers, lang,
    );
    const { out, model } = await explainWithAI(payload, rec);
    const { error } = await supabaseAdmin
      .from("recommendations")
      .update({
        rationale_text: out, model, prompt_version: PROMPT_VERSION, decision,
        best_supplier: rec.best?.offer.supplier ?? null,
        net_savings: rec.best ? Math.round(rec.best.netSavings * 100) / 100 : null,
      })
      .eq("id", data.recommendationId);
    if (error) throw new Error("Could not save the explanation");
    return { ...out, model, isFallback: model === "fallback" };
  });

/** Admin: delete and recreate demo recommendations + planned switches (no LLM). */
export const recalculateDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recalcDemo } = await import("./recalc.server");
    const res = await recalcDemo(supabaseAdmin);
    return {
      households: res.length,
      switchNow: res.filter((r) => r.decision === "switch_now").length,
      wait: res.filter((r) => r.decision === "wait").length,
    };
  });
