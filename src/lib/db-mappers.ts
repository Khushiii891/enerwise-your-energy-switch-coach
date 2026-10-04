import type { Database } from "@/integrations/supabase/types";
import type { Contract, ControlSettings, MarketOffer, PlannedSwitch, TariffType, Usage } from "./types";

type T = Database["public"]["Tables"];

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
  };
}

export function usageFromRow(r: T["usage"]["Row"]): Usage {
  return {
    monthlyElectricity: Number(r.monthly_electricity),
    monthlyGas: Number(r.monthly_gas),
    hasSolar: !!r.has_solar,
    annualGridImport: Number(r.annual_grid_import ?? 0),
    annualFeedIn: Number(r.annual_feed_in ?? 0),
  };
}

export function offerFromRow(r: T["tariffs"]["Row"]): MarketOffer {
  return {
    supplier: r.supplier,
    kwhPrice: Number(r.kwh_price),
    gasPrice: Number(r.gas_price),
    contractLength: r.contract_length,
    promo: Number(r.promo),
    tariffType: (r.tariff_type === "dynamic" ? "dynamic" : "fixed") as MarketOffer["tariffType"],
    feedInCost: Number(r.feed_in_cost_per_kwh ?? 0),
    feedInCompensation: Number(r.feed_in_compensation_per_kwh ?? 0),
  };
}

export function controlFromRow(r: T["control_settings"]["Row"]): ControlSettings {
  return {
    mode: r.mode === "auto" ? "auto" : "recommend",
    minSavings: Number(r.min_savings),
    allowedTypes: (r.allowed_types ?? []).filter((t): t is TariffType => t === "fixed" || t === "dynamic"),
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
