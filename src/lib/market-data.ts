import type { Contract, ControlSettings, MarketOffer, Usage } from "./types";

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


/**
 * Six mock supplier tariff records. Prices vary slightly so some are cheaper
 * than the typical current contract and some are not.
 */
export const MARKET_OFFERS: MarketOffer[] = [
  { supplier: "Budget Energie", tariffType: "fixed", kwhPrice: 0.275, gasPrice: 1.3, contractLength: 12, promo: 0, feedInCost: 0, feedInCompensation: 0.05 },
  { supplier: "Oxxio", tariffType: "dynamic", kwhPrice: 0.288, gasPrice: 1.35, contractLength: 12, promo: 2.5, feedInCost: 0.12, feedInCompensation: 0.07 },
  { supplier: "ANWB Energie", tariffType: "dynamic", kwhPrice: 0.299, gasPrice: 1.41, contractLength: 6, promo: 1.5, feedInCost: 0.09, feedInCompensation: 0.08 },
  { supplier: "Vattenfall", tariffType: "fixed", kwhPrice: 0.295, gasPrice: 1.38, contractLength: 12, promo: 3, feedInCost: 0.14, feedInCompensation: 0.06 },
  { supplier: "Eneco", tariffType: "fixed", kwhPrice: 0.305, gasPrice: 1.42, contractLength: 24, promo: 0, feedInCost: 0.11, feedInCompensation: 0.09 },
  { supplier: "Greenchoice", tariffType: "fixed", kwhPrice: 0.31, gasPrice: 1.5, contractLength: 12, promo: 5, feedInCost: 0, feedInCompensation: 0.04 },
];

export const DEFAULT_CONTROL: ControlSettings = {
  mode: "recommend",
  minSavings: 100,
  allowedTypes: ["fixed", "dynamic"],
  excludedSuppliers: [],
  cancelWindowDays: 7,
};
