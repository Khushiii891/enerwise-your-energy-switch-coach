import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useEnerwise } from "@/store/enerwise";
import type { Usage } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SolarEstimateInputs } from "@/lib/types";
import {
  DEFAULT_PANEL_WATTAGE,
  DEFAULT_TOTAL_USAGE,
  ORIENTATIONS,
  SHADINGS,
  estimateSolar,
  type Orientation,
  type Shading,
} from "@/lib/solarEstimate";
import { PageHeading, Field } from "./contract";

export const Route = createFileRoute("/usage")({
  head: () => ({
    meta: [
      { title: "My Usage — Enerwise" },
      {
        name: "description",
        content: "Enter your monthly energy usage so Enerwise can estimate real annual costs.",
      },
      { property: "og:title", content: "My Usage — Enerwise" },
      {
        property: "og:description",
        content: "Enter your monthly energy usage so Enerwise can estimate real annual costs.",
      },
    ],
  }),
  component: UsagePage,
});

function UsagePage() {
  const { usage, setUsage, controlSaved } = useEnerwise();
  const navigate = useNavigate();
  const [form, setForm] = useState<Usage>(usage);

  function update<K extends keyof Usage>(key: K, value: Usage[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await setUsage(form);
      toast.success("Usage saved", {
        description: "Your recommendation now uses these figures.",
      });
      navigate({ to: controlSaved ? "/" : "/settings" });
    } catch {
      toast.error("Could not save your usage. Please try again.");
    }
  }

  const annualElec = form.monthlyElectricity * 12;
  const annualGas = form.monthlyGas * 12;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeading
        eyebrow="Step 2"
        title="My Usage"
        description="A simple monthly picture of how much energy your household uses. No smart meter needed."
      />

      <form onSubmit={handleSubmit}>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">Monthly usage</CardTitle>
            <CardDescription>
              Enter your average monthly consumption for electricity and gas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
              <div>
                <Label htmlFor="solar" className="text-sm font-semibold">
                  I have solar panels
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Uses the rules after net metering ends on 1 January 2027.
                </p>
              </div>
              <Switch
                id="solar"
                checked={form.hasSolar}
                onCheckedChange={(v) => update("hasSolar", v)}
              />
            </div>

            {form.hasSolar ? (
              <SolarFields form={form} update={update} />
            ) : (
              <Field label="Electricity usage (kWh / month)" htmlFor="elec">
                <Input
                  id="elec"
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  value={form.monthlyElectricity}
                  onChange={(e) => update("monthlyElectricity", parseFloat(e.target.value) || 0)}
                />
              </Field>
            )}

            <Field label="Gas usage (m³ / month)" htmlFor="gas">
              <Input
                id="gas"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                value={form.monthlyGas}
                onChange={(e) => update("monthlyGas", parseFloat(e.target.value) || 0)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/40 p-4">
              {form.hasSolar ? (
                <Estimate
                  label="Net from grid / year"
                  value={`${(form.annualGridImport - form.annualFeedIn).toLocaleString("nl-NL")} kWh`}
                />
              ) : (
                <Estimate label="Electricity / year" value={`${annualElec.toLocaleString("nl-NL")} kWh`} />
              )}
              <Estimate label="Gas / year" value={`${annualGas.toLocaleString("nl-NL")} m³`} />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button asChild variant="outline">
              <Link to="/contract">Back to contract</Link>
            </Button>
            <Button type="submit">
              Save & view recommendation <ArrowRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

function SolarFields({
  form,
  update,
}: {
  form: Usage;
  update: <K extends keyof Usage>(key: K, value: Usage[K]) => void;
}) {
  const [showHelper, setShowHelper] = useState(!!form.estimate);
  const [inp, setInp] = useState<SolarEstimateInputs>(
    form.estimate ?? {
      panels: 10,
      wattage: DEFAULT_PANEL_WATTAGE,
      orientation: "S",
      shading: "none",
      hasBattery: false,
      totalUsage: DEFAULT_TOTAL_USAGE,
    },
  );
  const est = estimateSolar(inp);
  const set = <K extends keyof SolarEstimateInputs>(k: K, v: SolarEstimateInputs[K]) =>
    setInp((p) => ({ ...p, [k]: v }));
  const kwh = (n: number) => `${Math.round(n).toLocaleString("nl-NL")} kWh`;

  function useEstimate() {
    update("annualGridImport", Math.round(est.gridImportKwh));
    update("annualFeedIn", Math.round(est.feedInKwh));
    update("estimate", inp);
    toast.success("Estimate filled in — you can still edit both numbers.");
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <p className="text-xs text-muted-foreground">
        Both numbers are on your annual energy bill (<em>jaarafrekening</em>).
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Annual grid import (kWh)" htmlFor="gridImport">
          <Input id="gridImport" type="number" step="1" min="0" inputMode="numeric"
            value={form.annualGridImport}
            onChange={(e) => update("annualGridImport", parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Annual feed-in to the grid (kWh)" htmlFor="feedIn">
          <Input id="feedIn" type="number" step="1" min="0" inputMode="numeric"
            value={form.annualFeedIn}
            onChange={(e) => update("annualFeedIn", parseFloat(e.target.value) || 0)} />
        </Field>
      </div>

      {showHelper ? (
        <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Estimate from your panels</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Number of panels" htmlFor="panels">
              <Input id="panels" type="number" min="0" step="1" value={inp.panels}
                onChange={(e) => set("panels", parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Panel wattage (Wp)" htmlFor="wattage">
              <Input id="wattage" type="number" min="0" step="10" value={inp.wattage}
                onChange={(e) => set("wattage", parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Roof orientation" htmlFor="orientation">
              <Select value={inp.orientation} onValueChange={(v) => set("orientation", v as Orientation)}>
                <SelectTrigger id="orientation"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIENTATIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Shading" htmlFor="shading">
              <Select value={inp.shading} onValueChange={(v) => set("shading", v as Shading)}>
                <SelectTrigger id="shading"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHADINGS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Total yearly usage (kWh)" htmlFor="totalUsage">
              <Input id="totalUsage" type="number" min="0" step="100" value={inp.totalUsage}
                onChange={(e) => set("totalUsage", parseFloat(e.target.value) || 0)} />
            </Field>
            <div className="flex items-end gap-2 pb-2">
              <Switch id="battery" checked={inp.hasBattery} onCheckedChange={(v) => set("hasBattery", v)} />
              <Label htmlFor="battery" className="text-sm">Home battery</Label>
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Estimate – your jaarafrekening is more accurate
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Estimate label="System size" value={`${est.systemKwp.toLocaleString("nl-NL", { maximumFractionDigits: 2 })} kWp`} />
              <Estimate label="Production" value={kwh(est.productionKwh)} />
              <Estimate label="Self-consumed" value={kwh(est.selfConsumedKwh)} />
              <Estimate label="Feed-in" value={kwh(est.feedInKwh)} />
              <Estimate label="Grid import" value={kwh(est.gridImportKwh)} />
            </div>
          </div>
          <Button type="button" size="sm" variant="secondary" className="self-end" onClick={useEstimate}>
            Use estimate
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setShowHelper(true)}
          className="self-start text-xs font-medium text-primary underline-offset-2 hover:underline">
          Don't know? Estimate from your panels
        </button>
      )}
    </div>
  );
}

function Estimate({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="tabular text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
