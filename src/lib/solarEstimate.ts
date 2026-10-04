export type Orientation = "S" | "SE" | "SW" | "E" | "W" | "EW" | "N";
export type Shading = "none" | "some" | "heavy";

export const ORIENTATIONS: { value: Orientation; label: string; factor: number }[] = [
  { value: "S", label: "South", factor: 1.0 },
  { value: "SE", label: "South-East", factor: 0.95 },
  { value: "SW", label: "South-West", factor: 0.95 },
  { value: "E", label: "East", factor: 0.85 },
  { value: "W", label: "West", factor: 0.85 },
  { value: "EW", label: "East-West", factor: 0.85 },
  { value: "N", label: "North", factor: 0.65 },
];

export const SHADINGS: { value: Shading; label: string; factor: number }[] = [
  { value: "none", label: "None", factor: 1.0 },
  { value: "some", label: "Some", factor: 0.9 },
  { value: "heavy", label: "Heavy", factor: 0.75 },
];

export const BASE_YIELD = 1000; // kWh per kWp per year
export const PERFORMANCE_RATIO = 0.85;
export const SELF_CONSUMPTION_NO_BATTERY = 0.3;
export const SELF_CONSUMPTION_BATTERY = 0.6;
export const DEFAULT_PANEL_WATTAGE = 400;
export const DEFAULT_TOTAL_USAGE = 2700;

export interface SolarInput {
  panels: number;
  wattage: number;
  orientation: Orientation;
  shading: Shading;
  hasBattery: boolean;
  totalUsage: number;
}

export interface SolarEstimate {
  systemKwp: number;
  productionKwh: number;
  selfConsumedKwh: number;
  feedInKwh: number;
  gridImportKwh: number;
}

export function estimateSolar(i: SolarInput): SolarEstimate {
  const o = ORIENTATIONS.find((x) => x.value === i.orientation)?.factor ?? 1;
  const s = SHADINGS.find((x) => x.value === i.shading)?.factor ?? 1;
  const systemKwp = (i.panels * i.wattage) / 1000;
  const productionKwh = systemKwp * BASE_YIELD * o * s * PERFORMANCE_RATIO;
  const rate = i.hasBattery ? SELF_CONSUMPTION_BATTERY : SELF_CONSUMPTION_NO_BATTERY;
  const selfConsumedKwh = Math.min(productionKwh * rate, i.totalUsage);
  return {
    systemKwp,
    productionKwh,
    selfConsumedKwh,
    feedInKwh: productionKwh - selfConsumedKwh,
    gridImportKwh: i.totalUsage - selfConsumedKwh,
  };
}
