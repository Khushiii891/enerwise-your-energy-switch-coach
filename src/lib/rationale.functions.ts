import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildRecommendation } from "./calc";
import { DEFAULT_CONTRACT, DEFAULT_USAGE, MARKET_OFFERS } from "./market-data";
import type { Contract, MarketOffer, Usage } from "./types";

export const PROMPT_VERSION = "v1";
export const MODEL = "anthropic/claude-haiku-4-5";

const SYSTEM_PROMPT = `You are Enerwise, a calm, neutral advisor for Dutch households deciding
whether to switch energy suppliers.

You receive pre-calculated data. Rules:
- Use ONLY the numbers in the input. Never compute, estimate, or round
  differently. If a number is missing, don't mention it.
- Explain WHY NOW or WHY NOT YET in plain language (max 3 sentences),
  referring to the concrete drivers: exit fee vs. remaining contract time,
  price gap per kWh/m3, usage level, fixed vs. dynamic risk.
- If decision is "wait", say what would change the answer (e.g. "after
  your contract ends on [date], the exit fee disappears").
- For dynamic tariffs, mention price-volatility risk in one short clause.
- Never favor a supplier beyond what the numbers show. No hype, no urgency
  tactics. The user always decides and switches themselves.
- Reply in the language given in "lang" (default English; "nl" = Dutch).

Output JSON only, no markdown:
{"headline": "...", "rationale": "...", "caveat": "..."}`;

export interface RationaleResult {
  id: string | null;
  headline: string;
  rationale: string;
  caveat: string;
  model: string;
  promptVersion: string;
  isFallback: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function callClaude(payload: unknown): Promise<{ headline: string; rationale: string; caveat: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("missing key");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    console.error("rationale gateway error", res.status, await res.text().catch(() => ""));
    throw new Error(`gateway ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let refused = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text;
        if (ev.type === "message_delta" && ev.delta?.stop_reason === "refusal") refused = true;
        if (ev.type === "error") throw new Error(ev.error?.message ?? "stream error");
      } catch (e) {
        if (e instanceof Error && e.message !== "" && !(e instanceof SyntaxError)) throw e;
      }
    }
  }
  if (refused) throw new Error("refusal");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no json");
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.headline !== "string" || typeof parsed.rationale !== "string") throw new Error("bad json");
  return {
    headline: parsed.headline,
    rationale: parsed.rationale,
    caveat: typeof parsed.caveat === "string" ? parsed.caveat : "",
  };
}

export const generateRationale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lang: z.enum(["en", "nl"]), force: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<RationaleResult> => {
    const { supabase, userId } = context;
    const [c, u, t] = await Promise.all([
      supabase.from("contracts").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("usage").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("tariffs").select("*"),
    ]);
    const contract: Contract = c.data
      ? {
          supplier: c.data.supplier as Contract["supplier"],
          tariffType: c.data.tariff_type as Contract["tariffType"],
          pricePerKwh: Number(c.data.price_per_kwh),
          pricePerGas: Number(c.data.price_per_gas),
          contractEndDate: c.data.contract_end_date ?? "",
          exitFee: Number(c.data.exit_fee),
          exitFeeCondition: c.data.exit_fee_condition,
        }
      : DEFAULT_CONTRACT;
    const usage: Usage = u.data
      ? { monthlyElectricity: Number(u.data.monthly_electricity), monthlyGas: Number(u.data.monthly_gas) }
      : DEFAULT_USAGE;
    const offers: MarketOffer[] = t.data?.length
      ? t.data.map((r) => ({
          supplier: r.supplier,
          kwhPrice: Number(r.kwh_price),
          gasPrice: Number(r.gas_price),
          contractLength: r.contract_length,
          promo: Number(r.promo),
        }))
      : MARKET_OFFERS;

    const rec = buildRecommendation(contract, usage, offers);
    const decision = rec.shouldSwitch ? "switch_now" : "wait";
    const end = contract.contractEndDate ? new Date(contract.contractEndDate) : null;
    const daysUntilEnd = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)) : null;

    const payload = {
      lang: data.lang,
      decision,
      switch_threshold_eur: rec.threshold,
      current_contract: {
        supplier: contract.supplier,
        tariff_type: contract.tariffType,
        price_per_kwh_eur: contract.pricePerKwh,
        price_per_m3_gas_eur: contract.pricePerGas,
        contract_end_date: contract.contractEndDate || null,
        exit_fee_eur: contract.exitFee,
        exit_fee_condition: contract.exitFeeCondition,
      },
      usage: { monthly_kwh: usage.monthlyElectricity, monthly_m3_gas: usage.monthlyGas },
      days_until_contract_end: daysUntilEnd,
      exit_fee_applies_now: rec.exitFeeApplies,
      current_annual_cost_eur: r2(rec.results[0]?.annualCostCurrent ?? 0),
      top_candidates: rec.results.slice(0, 3).map((r) => ({
        supplier: r.offer.supplier,
        price_per_kwh_eur: r.offer.kwhPrice,
        price_per_m3_gas_eur: r.offer.gasPrice,
        annual_cost_eur: r2(r.annualCostCandidate),
        net_savings_eur: r2(r.netSavings),
      })),
    };
    const hash = JSON.stringify(payload);

    if (!data.force) {
      const { data: cached } = await supabase
        .from("recommendations")
        .select("*")
        .eq("user_id", userId)
        .eq("input_hash", hash)
        .eq("prompt_version", PROMPT_VERSION)
        .neq("model", "fallback")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached) {
        const rt = cached.rationale_text as { headline: string; rationale: string; caveat: string };
        return { id: cached.id, ...rt, model: cached.model, promptVersion: cached.prompt_version, isFallback: false };
      }
    }

    let out: { headline: string; rationale: string; caveat: string };
    let model = MODEL;
    try {
      out = await callClaude(payload);
    } catch (e) {
      console.error("rationale fallback:", e);
      model = "fallback";
      out = {
        headline: rec.shouldSwitch
          ? "Now looks like a good time to switch"
          : "Your current contract still wins — for now",
        rationale: rec.summary,
        caveat: "",
      };
    }

    const { data: saved, error } = await supabase
      .from("recommendations")
      .insert({
        user_id: userId,
        current_supplier: contract.supplier,
        best_supplier: rec.best?.offer.supplier ?? null,
        net_savings: rec.best ? r2(rec.best.netSavings) : null,
        decision,
        rationale_text: out,
        model,
        prompt_version: PROMPT_VERSION,
        lang: data.lang,
        input_hash: hash,
      })
      .select("id")
      .single();
    if (error) console.error("save recommendation failed", error);

    return { id: saved?.id ?? null, ...out, model, promptVersion: PROMPT_VERSION, isFallback: model === "fallback" };
  });

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ recommendationId: z.string().uuid(), helpful: z.boolean(), comment: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("feedback").insert({
      recommendation_id: data.recommendationId,
      user_id: context.userId,
      helpful: data.helpful,
      comment: data.comment ?? null,
    });
    if (error) throw new Error("Could not save feedback");
    return { ok: true };
  });
