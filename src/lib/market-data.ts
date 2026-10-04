import type { Contract, ControlSettings, Usage } from "./types";

/** Default "My Contract" — seeded so the dashboard shows a result immediately. */
export const DEFAULT_CONTRACT: Contract = {
  supplier: "Essent",
  tariffType: "fixed",
  pricePerKwh: 0.32,
  pricePerGas: 1.45,
  contractEndDate: "2027-01-31",
  exitFee: 50,
  exitFeeCondition: "only if switching before end date",
  feedInCost: 0.1,
  feedInCompensation: 0.06,
  fixedFeeMonth: null,
};

/** Default "My Usage". */
export const DEFAULT_USAGE: Usage = {
  monthlyElectricity: 250,
  monthlyGas: 120,
  hasSolar: false,
  annualGridImport: 0,
  annualFeedIn: 0,
};

export const DEFAULT_CONTROL: ControlSettings = {
  mode: "recommend",
  minSavings: 100,
  allowedTypes: ["fixed", "variable", "dynamic"],
  excludedSuppliers: [],
  cancelWindowDays: 7,
};
