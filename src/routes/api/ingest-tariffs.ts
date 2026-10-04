import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Endpoint for the weekly scraper (enerwise-scraper/, run by GitHub Actions).
 * Lovable Cloud doesn't expose the service-role key, so the scraper sends its
 * results here and the server writes them with its own admin client.
 *
 *   GET  -> current_tariffs rows (for the scraper's week-on-week jump check)
 *   POST -> { snapshots?: [...], runs?: [...] } appended to tariff_snapshots / scrape_runs
 *
 * Auth: "Authorization: Bearer <SCRAPER_INGEST_SECRET>" (Lovable secret + GitHub secret).
 */

const price = (lo: number, hi: number) => z.number().min(lo).max(hi).nullable();

const Snapshot = z.object({
  supplier: z.string().min(1).max(80),
  contract_type: z.enum(["variable", "fixed_1y", "fixed_3y"]),
  kwh_price: price(0, 2),
  gas_price: price(0, 5),
  fixed_fee_elec_month: price(0, 100),
  fixed_fee_gas_month: price(0, 100),
  // optional so older scraper versions keep working
  feed_in_cost_per_kwh: price(0, 2).default(null),
  feed_in_compensation_per_kwh: price(0, 2).default(null),
  feed_in_period: z.enum(["2026", "2027"]).nullable().default(null),
  price_note: z.string().max(500).nullable().default(null),
  valid_from: z.string().date().nullable().default(null),
  contract_length_months: z.number().int().min(0).max(120).nullable(),
  promo: z.string().max(500).nullable(),
  price_basis_detected: z.enum(["incl_tax", "supply_only", "unknown"]),
  source_url: z.string().url().max(500),
  method: z.string().max(20),
  scraped_at: z.string().datetime({ offset: true }),
  status: z.enum(["ok", "needs_review", "invalid"]),
  issues: z.string().max(2000).nullable(),
  raw_excerpt: z.string().max(2000).nullable(),
});

const Run = z.object({
  run_id: z.string().uuid(),
  supplier: z.string().min(1).max(80),
  ok: z.boolean(),
  records_found: z.number().int().min(0).max(1000),
  records_published: z.number().int().min(0).max(1000),
  error: z.string().max(1000).nullable(),
  duration_s: z.number().min(0).max(100000),
});

const Body = z.object({
  snapshots: z.array(Snapshot).max(100).default([]),
  runs: z.array(Run).max(50).default([]),
});

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env["SCRAPER_INGEST_SECRET"];
  if (!secret || secret.length < 32) return false; // refuse until a strong secret is configured
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(token), digest(secret));
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

/** Return errors as JSON (readable in the scraper's GitHub Actions log), not an HTML error page. */
const safe =
  (handler: (ctx: { request: Request }) => Promise<Response>) =>
  async (ctx: { request: Request }) => {
    try {
      return await handler(ctx);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "server error" }, 500);
    }
  };

export const Route = createFileRoute("/api/ingest-tariffs")({
  server: {
    handlers: {
      GET: safe(async ({ request }) => {
        if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("current_tariffs")
          .select("supplier,contract_type,kwh_price,gas_price,scraped_at");
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }),
      POST: safe(async ({ request }) => {
        if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid body", issues: parsed.error.issues.slice(0, 5) }, 400);
        const { snapshots, runs } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (snapshots.length) {
          const { error } = await supabaseAdmin.from("tariff_snapshots").insert(snapshots);
          if (error) return json({ error: error.message }, 500);
        }
        let recalculated = 0;
        if (snapshots.length) {
          // New prices: rerun the deterministic calculation for every user (no LLM calls).
          const { recalcAllUsers } = await import("@/lib/recalc.server");
          recalculated = (await recalcAllUsers(supabaseAdmin)).filter((r) => r.recommendationId).length;
        }
        if (runs.length) {
          const { error } = await supabaseAdmin.from("scrape_runs").insert(runs);
          if (error) return json({ error: error.message }, 500);
        }
        return json({ inserted: { snapshots: snapshots.length, runs: runs.length }, recalculated });
      }),
    },
  },
});
