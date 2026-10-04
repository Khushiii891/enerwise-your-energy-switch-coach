import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
    // scraped offers whose page listed no feed-in rates would show a misleading €0 bar
    .filter((r) => !r.offer.scrapedAt || r.offer.feedInKnown)
    .map((r) => ({
      supplier: r.offer.supplier,
      net:
        Math.round(
          netFeedIn(usage.annualFeedIn, r.offer.feedInCost, r.offer.feedInCompensation) * 100,
        ) / 100,
    }))
    .sort((a, b) => b.net - a.net);
  const kwh = (n: number) => `${Math.round(n).toLocaleString("nl-NL")} kWh`;
  const bestNet = best
    ? netFeedIn(usage.annualFeedIn, best.feedInCost, best.feedInCompensation)
    : 0;

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sun className="h-5 w-5 text-warning" /> Your solar
        </CardTitle>
        <CardDescription>
          Net metering ends on 1 January 2027. These costs are based on the new rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Grid import" value={kwh(usage.annualGridImport)} />
          <Stat label="Feed-in" value={kwh(usage.annualFeedIn)} />
          {best && (
            <>
              <Stat
                label={`Feed-in cost · ${best.supplier}`}
                value={formatEuro(usage.annualFeedIn * best.feedInCost)}
              />
              <Stat
                label="Feed-in compensation"
                value={formatEuro(usage.annualFeedIn * best.feedInCompensation)}
              />
              <Stat
                label="Net feed-in result / yr"
                value={bestNet > 0 ? `−${formatEuro(bestNet)}` : `+${formatEuro(-bestNet)}`}
              />
            </>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Net feed-in result per offer per year (red = you pay for feeding in, green = you earn)
          </p>
          {data.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              Feed-in rates for these offers aren't available yet. They're collected with the weekly
              price check.
            </p>
          )}
          {/* horizontal bars: long offer names ("Budget Energie – 1 year fixed") stay readable */}
          {data.length > 0 && (
            <div className="w-full" style={{ height: Math.max(160, data.length * 36 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => `€${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="supplier"
                    width={190}
                    interval={0}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    formatter={(v: number) => [
                      v > 0 ? `You pay ${formatEuro(v)}` : `You earn ${formatEuro(-v)}`,
                      "Net feed-in",
                    ]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="net" radius={[0, 4, 4, 0]}>
                    {data.map((d) => (
                      <Cell
                        key={d.supplier}
                        fill={d.net > 0 ? "var(--destructive)" : "var(--success)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tabular text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
