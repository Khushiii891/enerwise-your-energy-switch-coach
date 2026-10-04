export const SUPPLIERS = [
  "Essent",
  "Vattenfall",
  "Eneco",
  "Budget Energie",
  "Greenchoice",
] as const;

export type SupplierName = (typeof SUPPLIERS)[number];

export type TariffType = "fixed" | "dynamic";

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
}

export interface Usage {
  monthlyElectricity: number; // kWh / month
  monthlyGas: number; // m3 / month
  hasSolar: boolean;
  annualGridImport: number; // kWh / year (solar only)
  annualFeedIn: number; // kWh / year (solar only)
}

/** A live market offer from a supplier (mock data). */
export interface MarketOffer {
  supplier: string;
  kwhPrice: number; // €/kWh
  gasPrice: number; // €/m3
  contractLength: number; // months
  promo: number; // monthly discount in €
  tariffType: TariffType;
  feedInCost: number; // €/kWh
  feedInCompensation: number; // €/kWh
}

export interface SavingsResult {
  offer: MarketOffer;
  annualCostCurrent: number;
  annualCostCandidate: number;
  grossSavings: number;
  exitFeeApplied: boolean;
  exitFee: number;
  netSavings: number;
}

export interface Recommendation {
  results: SavingsResult[];
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
