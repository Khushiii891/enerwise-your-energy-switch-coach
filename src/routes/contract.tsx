import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, RotateCcw } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useEnerwise } from "@/store/enerwise";
import { DEFAULT_CONTRACT } from "@/lib/market-data";
import { SUPPLIERS, type Contract, type TariffType } from "@/lib/types";

export const Route = createFileRoute("/contract")({
  head: () => ({
    meta: [
      { title: "My Contract — Enerwise" },
      {
        name: "description",
        content: "Enter your current energy contract so Enerwise can judge the right time to switch.",
      },
      { property: "og:title", content: "My Contract — Enerwise" },
      {
        property: "og:description",
        content: "Enter your current energy contract so Enerwise can judge the right time to switch.",
      },
    ],
  }),
  component: ContractPage,
});

const EXIT_CONDITIONS = [
  "only if switching before end date",
  "always applies",
  "never applies",
] as const;

function ContractPage() {
  const { contract, setContract, reset } = useEnerwise();
  const navigate = useNavigate();
  const [form, setForm] = useState<Contract>(contract);

  function update<K extends keyof Contract>(key: K, value: Contract[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await setContract(form);
      toast.success("Contract saved", {
        description: "We've updated your recommendation.",
      });
      navigate({ to: "/" });
    } catch {
      toast.error("Could not save your contract. Please try again.");
    }
  }

  async function handleReset() {
    setForm(DEFAULT_CONTRACT);
    try {
      await reset();
      toast("Reset to default contract");
    } catch {
      toast.error("Could not reset. Please try again.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeading
        eyebrow="Step 1"
        title="My Contract"
        description="Tell us about your current energy deal so we can compare it against the market."
      />

      <form onSubmit={handleSubmit}>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">Current contract</CardTitle>
            <CardDescription>
              All fields stay on your device for this prototype.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field label="Current supplier" htmlFor="supplier">
              <Select
                value={form.supplier}
                onValueChange={(v) => update("supplier", v as Contract["supplier"])}
              >
                <SelectTrigger id="supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLIERS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tariff type" htmlFor="tariff-fixed">
              <RadioGroup
                value={form.tariffType}
                onValueChange={(v) => update("tariffType", v as TariffType)}
                className="grid grid-cols-2 gap-3"
              >
                <RadioCard value="fixed" id="tariff-fixed" label="Fixed" hint="Stable price" />
                <RadioCard value="dynamic" id="tariff-dynamic" label="Dynamic" hint="Hourly price" />
              </RadioGroup>
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Price per kWh (€)" htmlFor="kwh">
                <Input
                  id="kwh"
                  type="number"
                  step="0.001"
                  min="0"
                  inputMode="decimal"
                  value={form.pricePerKwh}
                  onChange={(e) => update("pricePerKwh", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Price per m³ gas (€)" htmlFor="gas">
                <Input
                  id="gas"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={form.pricePerGas}
                  onChange={(e) => update("pricePerGas", parseFloat(e.target.value) || 0)}
                />
              </Field>
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">
              Enter prices including energy tax and VAT, as shown on your contract or annual bill.
            </p>

            <Field label="Fixed delivery costs per month (€) — optional" htmlFor="fixedFee">
              <Input
                id="fixedFee"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="Electricity + gas combined"
                value={form.fixedFeeMonth ?? ""}
                onChange={(e) =>
                  update(
                    "fixedFeeMonth",
                    e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value) || 0),
                  )
                }
              />
            </Field>

            <Field label="Contract end date" htmlFor="endDate">
              <Input
                id="endDate"
                type="date"
                value={form.contractEndDate}
                onChange={(e) => update("contractEndDate", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Exit fee amount (€)" htmlFor="exitFee">
                <Input
                  id="exitFee"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={form.exitFee}
                  onChange={(e) => update("exitFee", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Exit fee condition" htmlFor="exitCondition">
                <Select
                  value={form.exitFeeCondition}
                  onValueChange={(v) => update("exitFeeCondition", v)}
                >
                  <SelectTrigger id="exitCondition">
                    <SelectValue placeholder="When does it apply?" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXIT_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Feed-in costs per kWh (€) — solar only" htmlFor="feedInCost">
                <Input
                  id="feedInCost"
                  type="number"
                  step="0.001"
                  min="0"
                  inputMode="decimal"
                  value={form.feedInCost}
                  onChange={(e) => update("feedInCost", parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Feed-in compensation per kWh (€)" htmlFor="feedInComp">
                <Input
                  id="feedInComp"
                  type="number"
                  step="0.001"
                  min="0"
                  inputMode="decimal"
                  value={form.feedInCompensation}
                  onChange={(e) => update("feedInCompensation", parseFloat(e.target.value) || 0)}
                />
              </Field>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button asChild variant="outline">
                <Link to="/usage">My Usage</Link>
              </Button>
              <Button type="submit">
                Save & view recommendation <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-primary">
        {eyebrow}
      </div>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function RadioCard({
  value,
  id,
  label,
  hint,
}: {
  value: string;
  id: string;
  label: string;
  hint: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-3 py-2.5 transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
    >
      <RadioGroupItem value={value} id={id} />
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
