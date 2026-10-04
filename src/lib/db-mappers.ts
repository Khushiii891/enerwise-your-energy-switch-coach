import type { SupabaseClient } from "@supabase/supabase-js";
import type { Orientation, Shading } from "./solarEstimate";
import type { Database } from "@/integrations/supabase/types";
import type { Contract, ControlSettings, MarketOffer, PlannedSwitch, TariffType, Usage } from "./types";

type T = Database["public"]["Tables"];
type V = Database["public"]["Views"];

export function contractFromRow(r: T["contracts"]["Row"]): Contract {
  return {
    supplier: r.supplier as Contract["supplier"],
    tariffType: r.tariff_type as Contract["tariffType"],
    pricePerKwh: Number(r.price_per_kwh),
    pricePerGas: Number(r.price_per_gas),
    contractEndDate: r.contract_end_date ?? "",
    exitFee: Number(r.exit_fee),
    exitFeeCondition: r.exit_fee_condition,
    feedInCost: Number(r.feed_in_cost_per_kwh ?? 0),
    feedInCompensation: Number(r.feed_in_compensation_per_kwh ?? 0),
    fixedFeeMonth: r.fixed_fee_month == null ? null : Number(r.fixed_fee_month),
  };
}

export function usageFromRow(r: T["usage"]["Row"]): Usage {
  return {
    monthlyElectricity: Number(r.monthly_electricity),
    monthlyGas: Number(r.monthly_gas),
    hasSolar: !!r.has_solar,
    annualGridImport: Number(r.annual_grid_import ?? 0),
    annualFeedIn: Number(r.annual_feed_in ?? 0),
    estimate: r.estimate_used
      ? {
          panels: r.panel_count ?? 0,
          wattage: r.panel_wattage ?? 400,
          orientation: (r.orientation ?? "S") as Orientation,
          shading: (r.shading ?? "none") as Shading,
          hasBattery: !!r.has_battery,
          totalUsage: Number(r.total_usage_kwh ?? 2700),
        }
      : null,
  };
}

const SCRAPED_CONTRACT_LABEL: Record<string, string> = {
  variable: "variable",
  fixed_1y: "1 year fixed",
  fixed_3y: "3 years fixed",
};

/**
 * A scraped row from the current_tariffs view (written by enerwise-scraper).
 * Prices include energy tax + VAT, excl. network costs. Feed-in rates are 0
 * (and hidden on the card) when the supplier page didn't list them.
 */
export function scrapedOfferFromRow(r: V["current_tariffs"]["Row"]): MarketOffer | null {
  if (!r.supplier || r.kwh_price == null || r.gas_price == null) return null;
  const ctype = r.contract_type ?? "variable";
  return {
    supplier: `${r.supplier} – ${SCRAPED_CONTRACT_LABEL[ctype] ?? ctype}`,
    kwhPrice: Number(r.kwh_price),
    gasPrice: Number(r.gas_price),
    contractLength: r.contract_length_months ?? 0,
    promo: 0,
    tariffType: ctype === "variable" ? "variable" : "fixed",
    feedInCost: Number(r.feed_in_cost_per_kwh ?? 0),
    feedInCompensation: Number(r.feed_in_compensation_per_kwh ?? 0),
    feedInKnown: r.feed_in_cost_per_kwh != null && r.feed_in_compensation_per_kwh != null,
    fixedFeeMonth:
      r.fixed_fee_elec_month == null && r.fixed_fee_gas_month == null
        ? undefined
        : Number(r.fixed_fee_elec_month ?? 0) + Number(r.fixed_fee_gas_month ?? 0),
    sourceUrl: r.source_url ?? undefined,
    scrapedAt: r.scraped_at ?? undefined,
    isStale: !!r.is_stale,
  };
}

/**
 * Live offers from the weekly scraper (current_tariffs view). No mock fallback:
 * if live prices are unavailable the app says so instead of showing fake offers.
 */
export async function loadOffers(supabase: SupabaseClient<Database>): Promise<MarketOffer[]> {
  const scraped = await supabase.from("current_tariffs").select("*");
  return (scraped.data ?? [])
    .map(scrapedOfferFromRow)
    .filter((o): o is MarketOffer => o !== null);
}

export function controlFromRow(r: T["control_settings"]["Row"]): ControlSettings {
  return {
    mode: r.mode === "auto" ? "auto" : "recommend",
    minSavings: Number(r.min_savings),
    allowedTypes: (r.allowed_types ?? []).filter((t): t is TariffType => t === "fixed" || t === "variable" || t === "dynamic"),
    excludedSuppliers: r.excluded_suppliers ?? [],
    cancelWindowDays: r.cancel_window_days,
  };
}

export function switchFromRow(r: T["planned_switches"]["Row"]): PlannedSwitch {
  return {
    id: r.id,
    supplier: r.supplier,
    netSavings: Number(r.net_savings),
    plannedDate: r.planned_date,
    status: r.status as PlannedSwitch["status"],
    cancelledAt: r.cancelled_at,
    createdAt: r.created_at,
  };
}
