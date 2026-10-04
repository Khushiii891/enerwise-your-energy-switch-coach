import { describe, expect, it } from "vitest";
import { estimateSolar } from "./solarEstimate";

const base = { panels: 10, wattage: 400, orientation: "S" as const, shading: "none" as const, hasBattery: false, totalUsage: 2700 };

describe("estimateSolar", () => {
  it("10 x 400 Wp south, no shade, no battery", () => {
    const r = estimateSolar(base);
    expect(r.systemKwp).toBe(4);
    expect(r.productionKwh).toBeCloseTo(3400);
    expect(r.selfConsumedKwh).toBeCloseTo(1020);
    expect(r.feedInKwh).toBeCloseTo(2380);
    expect(r.gridImportKwh).toBeCloseTo(1680);
  });
  it("battery raises self-consumption to 60%", () => {
    expect(estimateSolar({ ...base, hasBattery: true }).selfConsumedKwh).toBeCloseTo(2040);
  });
  it("orientation and shading factors multiply", () => {
    expect(estimateSolar({ ...base, orientation: "N", shading: "heavy" }).productionKwh).toBeCloseTo(3400 * 0.65 * 0.75);
  });
  it("self-consumption is capped at total usage", () => {
    const r = estimateSolar({ ...base, panels: 40, hasBattery: true, totalUsage: 2000 });
    expect(r.selfConsumedKwh).toBe(2000);
    expect(r.gridImportKwh).toBe(0);
  });
});
