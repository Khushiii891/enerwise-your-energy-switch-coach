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
        feedback: (r.feedback ?? []).map((f) => ({
          helpful: f.helpful,
          comment: f.comment,
          created_at: f.created_at,
        })),
      };
    });
  });
