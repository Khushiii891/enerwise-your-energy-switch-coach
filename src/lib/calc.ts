import type {
  Contract,
  MarketOffer,
  Recommendation,
  SavingsResult,
  Usage,
} from "./types";
import { MARKET_OFFERS } from "./market-data";

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

/** Annual energy cost for a price + usage combination, minus any promo. */
export function annualCost(
  kwhPrice: number,
  gasPrice: number,
  usage: Usage,
  monthlyPromo = 0,
): number {
  const electricity = usage.monthlyElectricity * 12 * kwhPrice;
  const gas = usage.monthlyGas * 12 * gasPrice;
  return electricity + gas - monthlyPromo * 12;
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
 */
export function buildRecommendation(
  contract: Contract,
  usage: Usage,
  offers: MarketOffer[] = MARKET_OFFERS,
  now: Date = new Date(),
): Recommendation {
  const currentAnnual = annualCost(
    contract.pricePerKwh,
    contract.pricePerGas,
    usage,
  );

  const exitFeeApplies = isWithinContract(contract.contractEndDate, now);

  const results: SavingsResult[] = offers
    .map((offer): SavingsResult => {
      const candidateAnnual = annualCost(
        offer.kwhPrice,
        offer.gasPrice,
        usage,
        offer.promo,
      );
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
        netSavings,
      };
    })
    .sort((a, b) => b.netSavings - a.netSavings);

  const best = results[0] ?? null;
  const shouldSwitch = (best?.netSavings ?? 0) > SWITCH_THRESHOLD;

  const summary = explain(contract, usage, best, shouldSwitch, exitFeeApplies, now);

  return {
    results,
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

  const endDate = contract.contractEndDate
    ? new Date(contract.contractEndDate).toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  if (shouldSwitch) {
    const feeNote = exitFeeApplies
      ? ` Even after your € ${contract.exitFee} exit fee, the move pays off.`
      : " Your contract has no exit fee in effect right now, so the full saving is yours.";
    const timeNote = endDate
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

  return `Your current contract still looks like the better deal — no candidate beats it right now. We'll keep watching the market for you.`;
}
