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
}

export interface Usage {
  monthlyElectricity: number; // kWh / month
  monthlyGas: number; // m3 / month
}

/** A live market offer from a supplier (mock data). */
export interface MarketOffer {
  supplier: string;
  kwhPrice: number; // €/kWh
  gasPrice: number; // €/m3
  contractLength: number; // months
  promo: number; // monthly discount in €
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
