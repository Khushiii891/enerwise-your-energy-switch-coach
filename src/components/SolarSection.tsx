import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEnerwise } from "@/store/enerwise";
import { formatEuro } from "@/lib/calc";

/** Net yearly feed-in result in €: positive = you pay, negative = you earn. */
export function netFeedIn(feedIn: number, cost: number, compensation: number) {
  return feedIn * (cost - compensation);
}

export function SolarSection() {
  const { usage, recommendation } = useEnerwise();
  if (!usage.hasSolar) return null;
  const best = recommendation.best?.offer;
  const data = recommendation.results
    .map((r) => ({
      supplier: r.offer.supplier,
      net: Math.round(netFeedIn(usage.annualFeedIn, r.offer.feedInCost, r.offer.feedInCompensation) * 100) / 100,
    }))
    .sort((a, b) => b.net - a.net);
  const kwh = (n: number) => `${Math.round(n).toLocaleString("nl-NL")} kWh`;
  const bestNet = best ? netFeedIn(usage.annualFeedIn, best.feedInCost, best.feedInCompensation) : 0;

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sun className="h-5 w-5 text-warning" /> Your solar
        </CardTitle>
        <CardDescription>Net metering ends on 1 January 2027. These costs are based on the new rules.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Grid import" value={kwh(usage.annualGridImport)} />
          <Stat label="Feed-in" value={kwh(usage.annualFeedIn)} />
          {best && (
            <>
              <Stat label={`Feed-in cost · ${best.supplier}`} value={formatEuro(usage.annualFeedIn * best.feedInCost)} />
              <Stat label="Feed-in compensation" value={formatEuro(usage.annualFeedIn * best.feedInCompensation)} />
              <Stat
                label="Net feed-in result / yr"
                value={bestNet > 0 ? `−${formatEuro(bestNet)}` : `+${formatEuro(-bestNet)}`}
              />
            </>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Net feed-in result per supplier per year (higher bar = you pay more for feeding in)
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="supplier" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `€${v}`} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  formatter={(v: number) => [v > 0 ? `You pay ${formatEuro(v)}` : `You earn ${formatEuro(-v)}`, "Net feed-in"]}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                  {data.map((d) => (
                    <Cell key={d.supplier} fill={d.net > 0 ? "var(--destructive)" : "var(--success)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
