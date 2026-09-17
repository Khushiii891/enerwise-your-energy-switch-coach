import type { Contract, MarketOffer, Usage } from "./types";

/** Default "My Contract" — seeded so the dashboard shows a result immediately. */
export const DEFAULT_CONTRACT: Contract = {
  supplier: "Essent",
  tariffType: "fixed",
  pricePerKwh: 0.32,
  pricePerGas: 1.45,
  contractEndDate: "2027-01-31",
  exitFee: 50,
  exitFeeCondition: "only if switching before end date",
};

/** Default "My Usage". */
export const DEFAULT_USAGE: Usage = {
  monthlyElectricity: 250,
  monthlyGas: 120,
};

/**
 * Six mock supplier tariff records. Prices vary slightly so some are cheaper
 * than the typical current contract and some are not.
 */
export const MARKET_OFFERS: MarketOffer[] = [
  {
    supplier: "Budget Energie",
    kwhPrice: 0.275,
    gasPrice: 1.3,
    contractLength: 12,
    promo: 0,
  },
  {
    supplier: "Oxxio",
    kwhPrice: 0.288,
    gasPrice: 1.35,
    contractLength: 12,
    promo: 2.5,
  },
  {
    supplier: "ANWB Energie",
    kwhPrice: 0.299,
    gasPrice: 1.41,
    contractLength: 6,
    promo: 1.5,
  },
  {
    supplier: "Vattenfall",
    kwhPrice: 0.295,
    gasPrice: 1.38,
    contractLength: 12,
    promo: 3,
  },
  {
    supplier: "Eneco",
    kwhPrice: 0.305,
    gasPrice: 1.42,
    contractLength: 24,
    promo: 0,
  },
  {
    supplier: "Greenchoice",
    kwhPrice: 0.31,
    gasPrice: 1.5,
    contractLength: 12,
    promo: 5,
  },
];
