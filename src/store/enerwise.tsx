import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { Contract, MarketOffer, Recommendation, Usage } from "@/lib/types";
import { DEFAULT_CONTRACT, DEFAULT_USAGE, MARKET_OFFERS } from "@/lib/market-data";
import { buildRecommendation } from "@/lib/calc";
import { supabase } from "@/integrations/supabase/client";
import { contractFromRow, offerFromRow, usageFromRow } from "@/lib/db-mappers";

interface EnerwiseContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  dataReady: boolean;
  contract: Contract;
  usage: Usage;
  offers: MarketOffer[];
  /** Bumps whenever saved data changes, so the AI explanation can refresh. */
  version: number;
  setContract: (next: Contract) => Promise<void>;
  setUsage: (next: Usage) => Promise<void>;
  reset: () => Promise<void>;
  recommendation: Recommendation;
}

const EnerwiseContext = createContext<EnerwiseContextValue | null>(null);

export function EnerwiseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [contract, setContractState] = useState<Contract>(DEFAULT_CONTRACT);
  const [usage, setUsageState] = useState<Usage>(DEFAULT_USAGE);
  const [offers, setOffers] = useState<MarketOffer[]>(MARKET_OFFERS);
  const [version, setVersion] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setDataReady(false);
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const roles = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (!cancelled) setIsAdmin(!!roles.data?.some((r) => r.role === "admin"));
      const [c, u, t] = await Promise.all([
        supabase.from("contracts").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("usage").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("tariffs").select("*"),
      ]);
      if (cancelled) return;
      setContractState(c.data ? contractFromRow(c.data) : DEFAULT_CONTRACT);
      setUsageState(u.data ? usageFromRow(u.data) : DEFAULT_USAGE);
      if (t.data?.length) setOffers(t.data.map(offerFromRow));
      setDataReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setContract = useCallback(
    async (next: Contract) => {
      setContractState(next);
      if (!userId) return;
      const { error } = await supabase.from("contracts").upsert({
        user_id: userId,
        supplier: next.supplier,
        tariff_type: next.tariffType,
        price_per_kwh: next.pricePerKwh,
        price_per_gas: next.pricePerGas,
        contract_end_date: next.contractEndDate || null,
        exit_fee: next.exitFee,
        exit_fee_condition: next.exitFeeCondition,
        feed_in_cost_per_kwh: next.feedInCost,
        feed_in_compensation_per_kwh: next.feedInCompensation,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setVersion((v) => v + 1);
    },
    [userId],
  );

  const setUsage = useCallback(
    async (next: Usage) => {
      setUsageState(next);
      if (!userId) return;
      const { error } = await supabase.from("usage").upsert({
        user_id: userId,
        monthly_electricity: next.monthlyElectricity,
        monthly_gas: next.monthlyGas,
        has_solar: next.hasSolar,
        annual_grid_import: next.annualGridImport,
        annual_feed_in: next.annualFeedIn,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setVersion((v) => v + 1);
    },
    [userId],
  );

  const reset = useCallback(async () => {
    await setContract(DEFAULT_CONTRACT);
    await setUsage(DEFAULT_USAGE);
  }, [setContract, setUsage]);

  const recommendation = useMemo(
    () => buildRecommendation(contract, usage, offers),
    [contract, usage, offers],
  );

  const value = useMemo<EnerwiseContextValue>(
    () => ({
      user,
      authReady,
      isAdmin,
      dataReady,
      contract,
      usage,
      offers,
      version,
      setContract,
      setUsage,
      reset,
      recommendation,
    }),
    [user, authReady, isAdmin, dataReady, contract, usage, offers, version, setContract, setUsage, reset, recommendation],
  );

  return <EnerwiseContext.Provider value={value}>{children}</EnerwiseContext.Provider>;
}

export function useEnerwise(): EnerwiseContextValue {
  const ctx = useContext(EnerwiseContext);
  if (!ctx) throw new Error("useEnerwise must be used within an EnerwiseProvider");
  return ctx;
}
