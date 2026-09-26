import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { listAdminRecommendations, type AdminRow } from "@/lib/admin.functions";
import { useEnerwise } from "@/store/enerwise";
import { formatEuro } from "@/lib/calc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Enerwise" },
      { name: "description", content: "Review all Enerwise recommendations and participant feedback." },
      { property: "og:title", content: "Admin — Enerwise" },
      { property: "og:description", content: "Admin overview of recommendations and feedback." },
    ],
  }),
  component: AdminPage,
});

type Decision = "all" | "switch_now" | "wait";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: AdminRow[]): string {
  const header = [
    "created_at", "user_id", "current_supplier", "best_supplier", "net_savings", "decision",
    "headline", "rationale", "caveat", "model", "prompt_version", "feedback_helpful", "feedback_comment",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const fbs = r.feedback.length ? r.feedback : [null];
    for (const f of fbs) {
      lines.push(
        [
          r.created_at, r.user_id, r.current_supplier, r.best_supplier, r.net_savings, r.decision,
          r.headline, r.rationale, r.caveat, r.model, r.prompt_version,
          f ? f.helpful : "", f?.comment ?? "",
        ].map(csvCell).join(","),
      );
    }
  }
  return lines.join("\n");
}

function AdminPage() {
  const { isAdmin } = useEnerwise();
  const list = useServerFn(listAdminRecommendations);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [decision, setDecision] = useState<Decision>("all");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await list({ data: { from: from || null, to: to || null, decision } }));
    } catch {
      toast.error("Could not load recommendations");
    } finally {
      setLoading(false);
    }
  }, [list, from, to, decision]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        This page is only available to admins.
      </div>
    );
  }

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enerwise-recommendations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Admin</h1>
        <p className="text-sm text-muted-foreground">All recommendations and participant feedback.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Decision</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as Decision)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="switch_now">Switch now</SelectItem>
                <SelectItem value="wait">Wait</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${rows.length} recommendations`}
            </span>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Created", "User", "Current", "Best", "Net saving", "Decision", "Rationale", "Model", "Prompt", "Feedback"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="tabular whitespace-nowrap px-3 py-2">{new Date(r.created_at).toLocaleString("nl-NL")}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{r.user_id.slice(0, 8)}</td>
                <td className="px-3 py-2">{r.current_supplier ?? "—"}</td>
                <td className="px-3 py-2">{r.best_supplier ?? "—"}</td>
                <td className="tabular whitespace-nowrap px-3 py-2">{r.net_savings === null ? "—" : formatEuro(r.net_savings)}</td>
                <td className="px-3 py-2">
                  <Badge variant={r.decision === "switch_now" ? "default" : "outline"}>{r.decision}</Badge>
                </td>
                <td className="max-w-md px-3 py-2">
                  <div className="font-semibold text-foreground">{r.headline}</div>
                  <div className="text-muted-foreground">{r.rationale}</div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.model}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.prompt_version}</td>
                <td className="px-3 py-2">
                  {r.feedback.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    r.feedback.map((f, i) => (
                      <div key={i} className="flex items-start gap-1">
                        {f.helpful ? (
                          <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-success" />
                        ) : (
                          <ThumbsDown className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        )}
                        {f.comment && <span className="text-muted-foreground">{f.comment}</span>}
                      </div>
                    ))
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                  No recommendations match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
