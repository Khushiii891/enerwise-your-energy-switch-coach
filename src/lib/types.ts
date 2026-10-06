export const SUPPLIERS = [
  "Essent",
  "Vattenfall",
  "Eneco",
  "Budget Energie",
  "Greenchoice",
  "Oxxio",
] as const;

export type SupplierName = (typeof SUPPLIERS)[number];

export type TariffType = "fixed" | "variable" | "dynamic";

export interface Contract {
  supplier: SupplierName;
  tariffType: TariffType;
  pricePerKwh: number; // €/kWh
  pricePerGas: number; // €/m3
  contractEndDate: string; // ISO date (yyyy-mm-dd), "" = no fixed end
  exitFee: number; // €
  exitFeeCondition: string;
  feedInCost: number; // €/kWh charged for feeding in
  feedInCompensation: number; // €/kWh paid back for feeding in
  fixedFeeMonth: number | null; // € fixed delivery costs per month (elec + gas), null = not entered
}

export interface Usage {
  monthlyElectricity: number; // kWh / month
  monthlyGas: number; // m3 / month
  hasSolar: boolean;
  annualGridImport: number; // kWh / year (solar only)
  annualFeedIn: number; // kWh / year (solar only)
  estimate?: SolarEstimateInputs | null; // set when the panel helper was used
}

export interface SolarEstimateInputs {
  panels: number;
  wattage: number;
  orientation: import("./solarEstimate").Orientation;
  shading: import("./solarEstimate").Shading;
  hasBattery: boolean;
  totalUsage: number;
}

/** A market offer: scraped weekly (current_tariffs view) or mock fallback. */
export interface MarketOffer {
  supplier: string;
  kwhPrice: number; // €/kWh
  gasPrice: number; // €/m3
  contractLength: number; // months, 0 = no fixed term
  promo: number; // monthly discount in €
  tariffType: TariffType;
  feedInCost: number; // €/kWh
  feedInCompensation: number; // €/kWh
  // Set only for scraped offers
  fixedFeeMonth?: number | undefined; // € per month, elec + gas
  feedInKnown?: boolean | undefined; // false = supplier page listed no feed-in rates
  sourceUrl?: string | undefined;
  scrapedAt?: string | undefined; // ISO timestamp
  isStale?: boolean | undefined; // last good scrape is older than 14 days
}

export interface SavingsResult {
  offer: MarketOffer;
  annualCostCurrent: number;
  annualCostCandidate: number;
  grossSavings: number;
  exitFeeApplied: boolean;
  exitFee: number;
  fixedFeesCounted: boolean; // false when the user hasn't entered their own fixed fee
  netSavings: number;
}

export interface Recommendation {
  results: SavingsResult[];
  /** Solar households only: offers left out because 2027 feed-in rates are unknown (NULL). */
  unrated: MarketOffer[];
  best: SavingsResult | null;
  shouldSwitch: boolean;
  threshold: number;
  exitFeeApplies: boolean;
  summary: string;
}

export type ControlMode = "recommend" | "auto";

export interface ControlSettings {
  mode: ControlMode;
  minSavings: number;
  allowedTypes: TariffType[];
  excludedSuppliers: string[];
  cancelWindowDays: number;
}

export interface PlannedSwitch {
  id: string;
  supplier: string;
  netSavings: number;
  plannedDate: string;
  status: "planned" | "cancelled" | "completed";
  cancelledAt: string | null;
  createdAt: string;
}
