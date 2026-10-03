import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  ShieldCheck,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEnerwise } from "@/store/enerwise";
import { formatEuro, SWITCH_THRESHOLD } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { AiRationale } from "@/components/AiRationale";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Recommendation — Enerwise" },
      {
        name: "description",
        content:
          "A clear, timing-aware recommendation on whether to switch energy suppliers now or wait.",
      },
      { property: "og:title", content: "My Recommendation — Enerwise" },
      {
        property: "og:description",
        content:
          "See your personalised net annual savings for each Dutch energy supplier and whether now is the right time to switch.",
      },
    ],
  }),
  component: RecommendationPage,
});

function RecommendationPage() {
  const { contract, usage, recommendation } = useEnerwise();

  return (
    <div className="flex flex-col gap-8">
      <RecommendationHero />

      <ContractSummary contract={contract} usage={usage} />

      <RecommendationBanner rec={recommendation} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Candidate suppliers
          </h2>
          <span className="text-xs text-muted-foreground">
            Sorted by net annual savings
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {recommendation.results.map((r) => (
            <SupplierCard
              key={r.offer.supplier}
              result={r}
              isBest={recommendation.best?.offer.supplier === r.offer.supplier}
              shouldSwitch={recommendation.shouldSwitch}
            />
          ))}
        </div>
      </section>

      <TimelineNote />
    </div>
  );
}

function RecommendationHero() {
  const { recommendation } = useEnerwise();
  const positive = recommendation.shouldSwitch;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative p-6 sm:p-8">
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-1",
            positive
              ? "bg-gradient-to-r from-primary via-success to-primary"
              : "bg-gradient-to-r from-muted via-muted-foreground/40 to-muted",
          )}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <AiRationale positive={positive} />

          <div className="shrink-0 rounded-2xl border border-border bg-background/60 p-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Best net saving / yr
            </div>
            <div
              className={cn(
                "tabular mt-1 text-3xl font-extrabold",
                positive ? "text-success" : "text-muted-foreground",
              )}
            >
              {formatEuro(Math.max(0, recommendation.best?.netSavings ?? 0))}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Switch threshold {formatEuro(SWITCH_THRESHOLD)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContractSummary({
  contract,
  usage,
}: {
  contract: ReturnType<typeof useEnerwise>["contract"];
  usage: ReturnType<typeof useEnerwise>["usage"];
}) {
  const items = [
    { label: "Supplier", value: contract.supplier },
    {
      label: "Tariff",
      value: contract.tariffType === "fixed" ? "Fixed" : "Dynamic",
    },
    { label: "Electricity", value: `€ ${contract.pricePerKwh.toFixed(3)}/kWh` },
    { label: "Gas", value: `€ ${contract.pricePerGas.toFixed(2)}/m³` },
    usage.hasSolar
      ? {
          label: "Solar / year",
          value: `${usage.annualGridImport} in · ${usage.annualFeedIn} out kWh`,
        }
      : {
          label: "Use / month",
          value: `${usage.monthlyElectricity} kWh · ${usage.monthlyGas} m³`,
        },
  ];

  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {items.map((item) => (
            <div key={item.label} className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </div>
              <div className="tabular truncate text-sm font-semibold text-foreground">
                {item.value}
              </div>
            </div>
          ))}
          <div className="col-span-2 flex sm:col-span-1 sm:justify-end">
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to="/contract">
                Edit contract <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendationBanner({
  rec,
}: {
  rec: ReturnType<typeof useEnerwise>["recommendation"];
}) {
  if (rec.shouldSwitch && rec.best) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Best option: {rec.best.offer.supplier}
            </p>
            <p className="text-sm text-muted-foreground">
              About {formatEuro(rec.best.netSavings)} net savings per year after
              {rec.exitFeeApplies ? (
                <> the €{rec.best.exitFee} exit fee.</>
              ) : (
                <> no exit fee.</>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold text-foreground">
          No switch worth making right now
        </p>
        <p className="text-sm text-muted-foreground">
          {rec.summary} We'll keep watching the market and flag a move once the
          net saving clears {formatEuro(SWITCH_THRESHOLD)}.
        </p>
      </div>
    </div>
  );
}

function SupplierCard({
  result,
  isBest,
  shouldSwitch,
}: {
  result: ReturnType<typeof useEnerwise>["recommendation"]["results"][number];
  isBest: boolean;
  shouldSwitch: boolean;
}) {
  const { offer, netSavings, exitFeeApplied, exitFee, grossSavings, annualCostCandidate } =
    result;
  const positive = netSavings > 0;
  const highlight = isBest && shouldSwitch;

  return (
    <Card
      className={cn(
        "relative flex flex-col transition-shadow",
        highlight
          ? "border-success/50 ring-1 ring-success/40 shadow-md"
          : "border-border/70",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold text-foreground">
              {offer.supplier}
            </CardTitle>
            <CardDescription className="mt-1">
              {offer.contractLength}-month contract
              {offer.promo > 0 && ` · €${offer.promo}/mo promo`}
            </CardDescription>
          </div>
          {highlight ? (
            <Badge className="bg-success text-success-foreground">Switch now</Badge>
          ) : isBest ? (
            <Badge variant="outline">Closest</Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Net annual saving
            </div>
            <div
              className={cn(
                "tabular text-2xl font-extrabold",
                positive ? "text-success" : "text-muted-foreground",
              )}
            >
              {netSavings > 0 ? "+" : ""}
              {formatEuro(netSavings)}
            </div>
          </div>
          <TrendingDown
            className={cn("h-5 w-5", positive ? "text-success" : "text-muted-foreground/50")}
          />
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <Row label="Electricity" value={`€ ${offer.kwhPrice.toFixed(3)}/kWh`} />
          <Row label="Gas" value={`€ ${offer.gasPrice.toFixed(2)}/m³`} />
          <Row
            label="Feed-in costs"
            value={offer.feedInCost === 0 ? "None" : `€ ${offer.feedInCost.toFixed(3)}/kWh`}
            tone={offer.feedInCost === 0 ? "pos" : "muted"}
          />
          <Row label="Feed-in compensation" value={`€ ${offer.feedInCompensation.toFixed(3)}/kWh`} />
          <Row label="Est. annual cost" value={formatEuro(annualCostCandidate)} />
          <Row
            label="Gross saving"
            value={formatEuro(grossSavings)}
            tone={grossSavings >= 0 ? "pos" : "neg"}
          />
          <Row
            label="Exit fee"
            value={exitFeeApplied ? `- ${formatEuro(exitFee)}` : "Not applied"}
            tone={exitFeeApplied ? "neg" : "muted"}
          />
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button asChild variant={highlight ? "default" : "outline"} size="sm">
            <a
              href="https://example.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              See offer <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {whySentence(positive, exitFeeApplied, offer.supplier)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function whySentence(positive: boolean, exitFeeApplied: boolean, supplier: string): string {
  if (!positive) {
    return `${supplier} isn't cheaper than your current deal, so there's nothing to gain by switching right now.`;
  }
  return exitFeeApplied
    ? `Cheaper than your current plan even after the exit fee — worth a closer look.`
    : `Cheaper than your current plan with no exit fee in effect — a strong candidate.`;
}

function Row({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "pos" | "neg";
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span
        className={cn(
          "tabular font-medium",
          tone === "pos" && "text-success",
          tone === "neg" && "text-destructive",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function TimelineNote() {
  return (
    <section className="rounded-xl border border-border/70 bg-card/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Recommendation only</p>
          <p>
            Enerwise judges timing — it does not execute switches. Any switching
            decision is yours to make and carry out yourself. Tariffs are mock
            data for this prototype and refresh as the market moves.
          </p>
        </div>
      </div>
    </section>
  );
}
