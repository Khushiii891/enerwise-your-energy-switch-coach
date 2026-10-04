import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Bot, Eye, FlaskConical } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useEnerwise } from "@/store/enerwise";
import type { ControlMode, ControlSettings, TariffType } from "@/lib/types";
import { PageHeading, Field } from "./contract";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Control mode — Enerwise" },
      {
        name: "description",
        content: "Choose whether Enerwise only recommends or plans a simulated switch for you.",
      },
      { property: "og:title", content: "Control mode — Enerwise" },
      {
        property: "og:description",
        content: "Choose between Recommend only and a simulated automatic switch with your own conditions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { control, controlSaved, setControl, offers, dataReady } = useEnerwise();
  const navigate = useNavigate();
  const [form, setForm] = useState<ControlSettings>(control);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (dataReady) setForm(control);
  }, [dataReady, control]);

  const suppliers = Array.from(new Set(offers.map((o) => o.supplier)));

  function toggleType(t: TariffType, on: boolean) {
    setForm((f) => ({
      ...f,
      allowedTypes: on ? Array.from(new Set([...f.allowedTypes, t])) : f.allowedTypes.filter((x) => x !== t),
    }));
  }
  function toggleExcluded(s: string, excluded: boolean) {
    setForm((f) => ({
      ...f,
      excludedSuppliers: excluded
        ? Array.from(new Set([...f.excludedSuppliers, s]))
        : f.excludedSuppliers.filter((x) => x !== s),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.mode === "auto" && form.allowedTypes.length === 0) {
      toast.error("Allow at least one tariff type.");
      return;
    }
    setSaving(true);
    try {
      await setControl({
        ...form,
        minSavings: Math.max(0, form.minSavings),
        cancelWindowDays: Math.min(60, Math.max(1, Math.round(form.cancelWindowDays))),
      });
      toast.success("Settings saved");
      navigate({ to: "/" });
    } catch {
      toast.error("Could not save your settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeading
        eyebrow={controlSaved ? "Settings" : "Step 3"}
        title="How should Enerwise act?"
        description="Choose whether Enerwise only advises you, or plans a switch for you when your own conditions are met. You can change this any time."
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <RadioGroup
          value={form.mode}
          onValueChange={(v) => setForm((f) => ({ ...f, mode: v as ControlMode }))}
          className="grid gap-3 sm:grid-cols-2"
        >
          <ModeCard
            value="recommend"
            icon={<Eye className="h-5 w-5" />}
            title="Recommend only"
            hint="Enerwise tells you when switching makes sense. You decide and switch yourself."
          />
          <ModeCard
            value="auto"
            icon={<Bot className="h-5 w-5" />}
            title="Switch automatically for me"
            hint="Enerwise plans a switch when your conditions are met, with time to cancel."
          />
        </RadioGroup>

        {form.mode === "auto" && (
          <Card className="border-border/70">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Your conditions</CardTitle>
                <SimulationBadge />
              </div>
              <CardDescription>
                A switch is only planned when the best option meets all of these. No real switch is
                ever made in this prototype.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Minimum net savings (€ / year)" htmlFor="minSavings">
                  <Input
                    id="minSavings"
                    type="number"
                    min="0"
                    step="10"
                    value={form.minSavings}
                    onChange={(e) => setForm((f) => ({ ...f, minSavings: parseFloat(e.target.value) || 0 }))}
                  />
                </Field>
                <Field label="Cancellation window (days)" htmlFor="window">
                  <Input
                    id="window"
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    value={form.cancelWindowDays}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cancelWindowDays: parseInt(e.target.value) || 1 }))
                    }
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Allowed tariff types</span>
                <div className="flex gap-4">
                  {(["fixed", "variable", "dynamic"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.allowedTypes.includes(t)}
                        onCheckedChange={(v) => toggleType(t, v === true)}
                      />
                      {{ fixed: "Fixed", variable: "Variable", dynamic: "Dynamic" }[t]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Excluded suppliers</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {suppliers.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.excludedSuppliers.includes(s)}
                        onCheckedChange={(v) => toggleExcluded(s, v === true)}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <p className="text-[11px] text-muted-foreground">
                Saving new conditions cancels any switch that is currently planned and re-checks the market.
              </p>
            </CardFooter>
          </Card>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            Save & view recommendation <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function ModeCard({
  value,
  icon,
  title,
  hint,
}: {
  value: ControlMode;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  const id = `mode-${value}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-input bg-card p-4 transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
    >
      <RadioGroupItem value={value} id={id} className="mt-1" />
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-primary">{icon}</span>
          {title}
          {value === "recommend" && (
            <span className="text-[10px] font-medium uppercase text-muted-foreground">Default</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export function SimulationBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
      <FlaskConical className="h-3 w-3" /> Simulation
    </span>
  );
}
