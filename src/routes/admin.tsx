import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { generateAdminRationale, listAdminControl, listAdminRecommendations, recalculateDemoData, type AdminControlRow, type AdminRow, type AdminSwitchRow } from "@/lib/admin.functions";
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

function section(title: string, header: string[], rows: unknown[][]): string {
  return [`# ${title}`, header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

function toCsv(rows: AdminRow[], settings: AdminControlRow[], switches: AdminSwitchRow[]): string {
  return [
    "# Recommendations",
    recCsv(rows),
    "",
    section(
      "Control settings",
      ["created_at", "user_id", "mode", "min_savings", "allowed_types", "excluded_suppliers", "cancel_window_days"],
      settings.map((s) => [s.created_at, s.user_id, s.mode, s.min_savings, s.allowed_types.join("|"), s.excluded_suppliers.join("|"), s.cancel_window_days]),
    ),
    "",
    section(
      "Planned switches",
      ["created_at", "user_id", "supplier", "net_savings", "planned_date", "status", "cancelled_at"],
      switches.map((w) => [w.created_at, w.user_id, w.supplier, w.net_savings, w.planned_date, w.status, w.cancelled_at]),
    ),
  ].join("\n");
}

function recCsv(rows: AdminRow[]): string {
  const header = [
    "created_at", "user_id", "is_demo", "customer_type", "current_supplier", "best_supplier", "net_savings", "decision",
    "headline", "rationale", "caveat", "model", "prompt_version", "feedback_helpful", "feedback_comment",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const fbs = r.feedback.length ? r.feedback : [null];
    for (const f of fbs) {
      lines.push(
        [
          r.created_at, r.user_id, r.is_demo, r.customer_type ?? "", r.current_supplier, r.best_supplier, r.net_savings, r.decision,
          r.headline, r.rationale, r.caveat, r.model, r.prompt_version,
          f ? f.helpful : "", f?.comment ?? "",
        ].map(csvCell).join(","),
      );
    }
  }
  return lines.join("\n");
}

/** Rows arrive newest first; keep each user's first (= latest) recommendation. */
function latestPerUser(rows: AdminRow[]): AdminRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)));
}

type Audience = "all" | "demo" | "real";

function AdminPage() {
  const { isAdmin } = useEnerwise();
  const list = useServerFn(listAdminRecommendations);
  const listControl = useServerFn(listAdminControl);
  const genAi = useServerFn(generateAdminRationale);
  const recalcDemo = useServerFn(recalculateDemoData);
  const [settings, setSettings] = useState<AdminControlRow[]>([]);
  const [switches, setSwitches] = useState<AdminSwitchRow[]>([]);
  const [demoIds, setDemoIds] = useState<Set<string>>(new Set());
  const [customerTypes, setCustomerTypes] = useState<string[]>([]);
  const [customerType, setCustomerType] = useState("all");
  const [includeDemo, setIncludeDemo] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [csvLatestOnly, setCsvLatestOnly] = useState(true);
  const [audience, setAudience] = useState<Audience>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const loadControl = useCallback(() => {
    listControl()
      .then((d) => {
        setSettings(d.settings); setSwitches(d.switches);
        setDemoIds(new Set(d.demoUserIds)); setCustomerTypes(d.customerTypes);
      })
      .catch(() => toast.error("Could not load control settings"));
  }, [listControl]);
  useEffect(() => {
    if (isAdmin) loadControl();
  }, [isAdmin, loadControl]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [decision, setDecision] = useState<Decision>("all");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await list({ data: { from: from || null, to: to || null, decision, customerType: customerType === "all" ? null : customerType } }));
    } catch {
      toast.error("Could not load recommendations");
    } finally {
      setLoading(false);
    }
  }, [list, from, to, decision, customerType]);

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

  async function aiFor(id: string) {
    setBusyId(id);
    try {
      const r = await genAi({ data: { recommendationId: id } });
      toast[r.isFallback ? "warning" : "success"](r.isFallback ? "AI explanation failed the number check — kept the standard text" : "AI explanation saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate explanation");
    } finally {
      setBusyId(null);
    }
  }

  async function recalc() {
    if (!confirm("Delete and recreate all demo recommendations and planned switches? Demo feedback is kept.")) return;
    setRecalcBusy(true);
    try {
      const r = await recalcDemo();
      toast.success(`Recalculated ${r.households} demo households: ${r.switchNow} switch now, ${r.wait} wait`);
      await load();
      loadControl();
    } catch {
      toast.error("Could not recalculate demo data");
    } finally {
      setRecalcBusy(false);
    }
  }

  const inAudience = (uid: string) =>
    audience === "all" || (audience === "demo" ? demoIds.has(uid) : !demoIds.has(uid));
  const audienceRows = rows.filter((r) => inAudience(r.user_id));
  const visible = showHistory ? audienceRows : latestPerUser(audienceRows);

  function exportCsv() {
    const keep = (uid: string) => inAudience(uid) && (includeDemo || !demoIds.has(uid));
    const recRows = audienceRows.filter((r) => keep(r.user_id));
    const blob = new Blob([toCsv(csvLatestOnly ? latestPerUser(recRows) : recRows, settings.filter((x) => keep(x.user_id)), switches.filter((x) => keep(x.user_id)))], { type: "text/csv;charset=utf-8" });
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
          <div className="flex flex-col gap-1.5">
            <Label>Customer type</Label>
            <Select value={customerType} onValueChange={setCustomerType}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {customerTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Households</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="demo">Demo</SelectItem>
                <SelectItem value="real">Real</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} />
              Show history
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={csvLatestOnly} onChange={(e) => setCsvLatestOnly(e.target.checked)} />
              Export latest only
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
              Include demo rows in export
            </label>
            <Button variant="outline" size="sm" onClick={recalc} disabled={recalcBusy}>
              <RefreshCw className={`h-4 w-4 ${recalcBusy ? "animate-spin" : ""}`} /> Recalculate demo data
            </Button>
            <span className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${visible.length} recommendations`}
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
              {["Created", "User", "Current", "Best", "Net saving", "Decision", "Rationale", "Model", "Prompt", "Feedback", ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="tabular whitespace-nowrap px-3 py-2">{new Date(r.created_at).toLocaleString("nl-NL")}</td>
                <td className="px-3 py-2">
                  <div className="font-mono text-[10px] text-muted-foreground">{r.household_id ?? r.user_id.slice(0, 8)}</div>
                  {r.is_demo && <Badge variant="secondary" className="mt-1">Demo</Badge>}
                  {r.customer_type && <div className="mt-1 text-[10px] text-muted-foreground">{r.customer_type}</div>}
                </td>
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
                <td className="px-3 py-2">
                  <Button variant="outline" size="sm" onClick={() => aiFor(r.id)} disabled={busyId === r.id}>
                    <Sparkles className="h-3.5 w-3.5" /> {busyId === r.id ? "Generating…" : "Generate AI rationale"}
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">
                  No recommendations match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SimpleTable
        title="Control settings"
        headers={["Created", "User", "Mode", "Min saving", "Allowed types", "Excluded", "Cancel window"]}
        rows={settings.map((s) => [
          new Date(s.created_at).toLocaleString("nl-NL"), s.user_id.slice(0, 8), s.mode, formatEuro(s.min_savings),
          s.allowed_types.join(", "), s.excluded_suppliers.join(", ") || "—", `${s.cancel_window_days} days`,
        ])}
      />
      <SimpleTable
        title="Planned switches (simulated)"
        headers={["Created", "User", "Supplier", "Net saving", "Planned date", "Status", "Cancelled at"]}
        rows={switches.map((w) => [
          new Date(w.created_at).toLocaleString("nl-NL"), w.user_id.slice(0, 8), w.supplier, formatEuro(w.net_savings),
          new Date(w.planned_date).toLocaleDateString("nl-NL"), w.status,
          w.cancelled_at ? new Date(w.cancelled_at).toLocaleString("nl-NL") : "—",
        ])}
      />
    </div>
  );
}

function SimpleTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[800px] text-left text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>{headers.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">Nothing yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
