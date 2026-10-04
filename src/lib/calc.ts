import type {
  Contract,
  ControlSettings,
  MarketOffer,
  Recommendation,
  SavingsResult,
  Usage,
} from "./types";

export const SWITCH_THRESHOLD = 50; // € net annual savings to recommend switching

const eur = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

/** Format a number as Dutch euros, e.g. € 1.234,56. */
export function formatEuro(value: number): string {
  return eur.format(Number.isFinite(value) ? value : 0);
}

/**
 * Annual electricity cost.
 * Solar households use post-2027 rules (net metering ends 1 Jan 2027):
 *   grid_import * kwh_price + feed_in * (feed_in_cost - feed_in_compensation)
 */
export function annualElectricityCost(
  kwhPrice: number,
  usage: Usage,
  feedInCost = 0,
  feedInCompensation = 0,
): number {
  if (usage.hasSolar) {
    return (
      usage.annualGridImport * kwhPrice +
      usage.annualFeedIn * (feedInCost - feedInCompensation)
    );
  }
  return usage.monthlyElectricity * 12 * kwhPrice;
}

/** Annual energy cost for a price + usage combination, minus any promo. */
export function annualCost(
  kwhPrice: number,
  gasPrice: number,
  usage: Usage,
  monthlyPromo = 0,
  feedInCost = 0,
  feedInCompensation = 0,
): number {
  const electricity = annualElectricityCost(kwhPrice, usage, feedInCost, feedInCompensation);
  const gas = usage.monthlyGas * 12 * gasPrice;
  return electricity + gas - monthlyPromo * 12;
}

/** Format an ISO date in the explanation's language, e.g. "31 January 2027" / "31 januari 2027". */
export function formatDateLong(iso: string, lang: "en" | "nl" = "en"): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** True when a contract end date is set and lies before today (calendar days). */
export function hasContractEnded(endDate: string, now: Date = new Date()): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return false;
  return !isWithinContract(endDate, now) && endDate.slice(0, 10) < now.toISOString().slice(0, 10);
}

/** True when an exit fee would be charged (today is before the contract end date). */
export function isWithinContract(endDate: string, now: Date = new Date()): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return false;
  // Compare calendar days: zero out the time so a same-day end is not penalised.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return today < endDateOnly;
}

/**
 * Core recommendation engine.
 *
 * For each candidate offer:
 *   net_savings = (annual cost with current contract)
 *               - (annual cost with candidate contract)
 *               - (exit fee, only if today < contract end date)
 *
 * Fixed monthly fees ×12 are added to both sides only when the user entered
 * their own fixed fee; otherwise they're left out everywhere so the
 * comparison stays like-for-like. Offers with no known fee count as €0.
 */
export function buildRecommendation(
  contract: Contract,
  usage: Usage,
  offers: MarketOffer[],
  now: Date = new Date(),
): Recommendation {
  const fixedFeesCounted = contract.fixedFeeMonth != null;
  const currentAnnual =
    annualCost(
      contract.pricePerKwh,
      contract.pricePerGas,
      usage,
      0,
      contract.feedInCost,
      contract.feedInCompensation,
    ) + (fixedFeesCounted ? (contract.fixedFeeMonth ?? 0) * 12 : 0);

  const exitFeeApplies = isWithinContract(contract.contractEndDate, now);

  // Solar households: an offer without published 2027 feed-in rates can't be
  // compared (NULL is never treated as 0), so it is set aside, not costed.
  const unrated = usage.hasSolar ? offers.filter((o) => o.feedInKnown === false) : [];
  const comparable = usage.hasSolar ? offers.filter((o) => o.feedInKnown !== false) : offers;

  const results: SavingsResult[] = comparable
    .map((offer): SavingsResult => {
      const candidateAnnual =
        annualCost(
          offer.kwhPrice,
          offer.gasPrice,
          usage,
          offer.promo,
          offer.feedInCost,
          offer.feedInCompensation,
        ) + (fixedFeesCounted ? (offer.fixedFeeMonth ?? 0) * 12 : 0);
      const grossSavings = currentAnnual - candidateAnnual;
      const exitFee = exitFeeApplies ? contract.exitFee : 0;
      const netSavings = grossSavings - exitFee;
      return {
        offer,
        annualCostCurrent: currentAnnual,
        annualCostCandidate: candidateAnnual,
        grossSavings,
        exitFeeApplied: exitFeeApplies,
        exitFee,
        fixedFeesCounted,
        netSavings,
      };
    })
    .sort((a, b) => b.netSavings - a.netSavings);

  const best = results[0] ?? null;
  const shouldSwitch = (best?.netSavings ?? 0) > SWITCH_THRESHOLD;

  const summary = explain(contract, usage, best, shouldSwitch, exitFeeApplies, now);

  return {
    results,
    unrated,
    best,
    shouldSwitch,
    threshold: SWITCH_THRESHOLD,
    exitFeeApplies,
    summary,
  };
}

function explain(
  contract: Contract,
  _usage: Usage,
  best: SavingsResult | null,
  shouldSwitch: boolean,
  exitFeeApplies: boolean,
  now: Date,
): string {
  if (!best) {
    return "We couldn't find any offers to compare right now. We'll keep watching the market for you.";
  }

  // The static explanation is English, so dates are formatted in English regardless of browser locale.
  const endDate = contract.contractEndDate ? formatDateLong(contract.contractEndDate, "en") : null;
  const ended = hasContractEnded(contract.contractEndDate, now);

  if (shouldSwitch) {
    const feeNote = exitFeeApplies
      ? ` Even after your € ${contract.exitFee} exit fee, the move pays off.`
      : ended && endDate
        ? ` Your contract ended on ${endDate}, so there is no exit fee and the full saving is yours.`
        : " Your contract has no exit fee in effect right now, so the full saving is yours.";
    const timeNote =
      endDate && !ended
        ? ` Your current contract runs until ${endDate}, so acting now maximises the months you'd benefit.`
        : "";
    return `Switching to ${best.offer.supplier} would save you about ${formatEuro(
      best.netSavings,
    )} per year.${feeNote}${timeNote}`;
  }

  if (best.netSavings > 0) {
    return `${best.offer.supplier} is slightly cheaper, but the saving of about ${formatEuro(
      best.netSavings,
    )} is under our ${formatEuro(
      SWITCH_THRESHOLD,
    )} switch threshold. Waiting could let the gap widen.`;
  }

  if (ended && endDate) {
    return `Your contract ended on ${endDate}, so there is no exit fee — but no candidate beats your current prices right now. We'll keep watching the market for you.`;
  }
  return `Your current contract still looks like the better deal — no candidate beats it right now. We'll keep watching the market for you.`;
}

/**
 * Automatic mode (simulation): the best candidate that meets ALL of the
 * user's own conditions, and still clears the standard switch threshold.
 */
export function pickAutoSwitch(rec: Recommendation, settings: ControlSettings): SavingsResult | null {
  return (
    rec.results.find(
      (r) =>
        r.netSavings > SWITCH_THRESHOLD &&
        r.netSavings >= settings.minSavings &&
        settings.allowedTypes.includes(r.offer.tariffType) &&
        !settings.excludedSuppliers.includes(r.offer.supplier),
    ) ?? null
  );
}
