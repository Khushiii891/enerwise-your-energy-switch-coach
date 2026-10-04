import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, Settings2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEnerwise } from "@/store/enerwise";
import { formatEuro } from "@/lib/calc";
import { SimulationBadge } from "@/routes/settings";

function remaining(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${sec}s`;
}

export function PlannedSwitchCard() {
  const { control, latestSwitch: s, cancelSwitch, refreshSwitch } = useEnerwise();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (s?.status !== "planned") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s?.status]);

  const left = s ? new Date(s.plannedDate).getTime() - now : 0;
  useEffect(() => {
    if (s?.status === "planned" && left <= 0) refreshSwitch();
  }, [s?.status, left, refreshSwitch]);

  if (control.mode !== "auto") return null;

  const date = s
    ? new Date(s.plannedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  let body: React.ReactNode;
  if (!s || (s.status === "cancelled" && !s.cancelledAt)) {
    body = <Idle />;
  } else if (s.status === "planned") {
    body = (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Enerwise will switch you to {s.supplier} on {date}.
            </p>
            <p className="text-sm text-muted-foreground">
              You save {formatEuro(s.netSavings)} per year.
            </p>
            <p className="tabular mt-1 text-xs text-muted-foreground">
              Time left to cancel: <span className="font-semibold text-foreground">{remaining(left)}</span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await cancelSwitch();
              toast.success("Planned switch cancelled");
            } catch {
              toast.error("Couldn't cancel. Please try again.");
            }
          }}
        >
          <XCircle className="h-4 w-4" /> Cancel
        </Button>
      </div>
    );
  } else if (s.status === "completed") {
    body = (
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div>
          <p className="text-sm font-semibold text-foreground">Switched (simulation) to {s.supplier}</p>
          <p className="text-sm text-muted-foreground">
            On {date}, saving {formatEuro(s.netSavings)} per year. No real contract was changed.
          </p>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex items-start gap-3">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-foreground">You cancelled the switch to {s.supplier}</p>
          <p className="text-sm text-muted-foreground">
            Enerwise won't plan it again, but will plan a different supplier if one meets your conditions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">Planned switch</span>
        <SimulationBadge />
        <Link
          to="/settings"
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" /> Conditions
        </Link>
      </div>
      {body}
    </section>
  );
}

function Idle() {
  const { control } = useEnerwise();
  return (
    <p className="text-sm text-muted-foreground">
      No option meets all your conditions right now (at least {formatEuro(control.minSavings)} net
      savings per year, {control.allowedTypes.join(" or ")} tariff
      {control.excludedSuppliers.length ? `, excluding ${control.excludedSuppliers.join(", ")}` : ""}).
      Enerwise keeps watching and will plan a switch, with {control.cancelWindowDays} days to cancel.
    </p>
  );
}
