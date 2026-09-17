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
  const { usage, setUsage } = useEnerwise();
  const navigate = useNavigate();
  const [form, setForm] = useState<Usage>(usage);

  function update<K extends keyof Usage>(key: K, value: Usage[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUsage(form);
    toast.success("Usage saved", {
      description: "Your recommendation now uses these figures.",
    });
    navigate({ to: "/" });
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
              <Estimate label="Electricity / year" value={`${annualElec.toLocaleString("nl-NL")} kWh`} />
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
