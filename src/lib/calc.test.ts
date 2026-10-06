import { describe, expect, it } from "vitest";
import { buildRecommendation, isWithinContract } from "./calc";
import type { Contract, MarketOffer, Usage } from "./types";

const now = new Date(2026, 9, 6, 12);
const contract: Contract = {
  supplier: "Essent",
  tariffType: "fixed",
  pricePerKwh: 0.32,
  pricePerGas: 1.45,
  contractEndDate: "2027-01-31",
  exitFee: 50,
  exitFeeCondition: "only if switching before end date",
  feedInCost: 0,
  feedInCompensation: 0,
  fixedFeeMonth: null,
};
const usage: Usage = { monthlyElectricity: 250, monthlyGas: 120, hasSolar: false, annualGridImport: 0, annualFeedIn: 0 };
const offer: MarketOffer = {
  supplier: "X",
  kwhPrice: 0.3,
  gasPrice: 1.4,
  contractLength: 12,
  promo: 0,
  tariffType: "fixed",
  feedInCost: 0,
  feedInCompensation: 0,
};

describe("buildRecommendation", () => {
  it("deducts the exit fee before the end date", () => {
    expect(buildRecommendation(contract, usage, [offer], now).best?.netSavings).toBeCloseTo(82);
  });
  it("never charges the exit fee when the condition is 'never applies'", () => {
    const rec = buildRecommendation({ ...contract, exitFeeCondition: "never applies" }, usage, [offer], now);
    expect(rec.best?.exitFee).toBe(0);
  });
  it("charges the exit fee after the end date when the condition is 'always applies'", () => {
    const rec = buildRecommendation(
      { ...contract, contractEndDate: "2026-01-01", exitFeeCondition: "always applies" },
      usage,
      [offer],
      now,
    );
    expect(rec.best?.exitFee).toBe(50);
  });
  it("doesn't invent savings from an offer whose fixed fee is unknown", () => {
    const same = { ...offer, kwhPrice: 0.32, gasPrice: 1.45 };
    const rec = buildRecommendation({ ...contract, fixedFeeMonth: 15 }, usage, [same], now);
    expect(rec.best?.grossSavings).toBe(0);
    expect(rec.shouldSwitch).toBe(false);
  });
});

describe("isWithinContract", () => {
  it("treats the end date as a local calendar day", () => {
    expect(isWithinContract("2026-10-07", now)).toBe(true);
    expect(isWithinContract("2026-10-06", now)).toBe(false);
  });
});
