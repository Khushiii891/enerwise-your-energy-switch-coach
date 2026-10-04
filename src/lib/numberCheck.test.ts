import { describe, expect, it } from "vitest";
import { findUnknownNumbers } from "./numberCheck";

const payload = { exit_fee_eur: 50, top: [{ net_savings_eur: 318.1, annual_cost_eur: 1360.5 }], end: "2027-01-01" };

describe("findUnknownNumbers", () => {
  it("accepts numbers taken from the input", () => {
    expect(findUnknownNumbers("You save €318.10 (€318,10), exit fee €50, cost €1,360.50 by 1 January 2027.", payload)).toEqual([]);
  });
  it("flags a number the AI calculated itself (exit fee subtracted twice)", () => {
    expect(findUnknownNumbers("netting €268.1 in year one", payload)).toEqual(["268.1"]);
  });
  it("flags €251 when the real saving is €301", () => {
    expect(findUnknownNumbers("you'd be €251 ahead", { net_savings_eur: 301, exit_fee_eur: 50 })).toEqual(["251"]);
  });
});
