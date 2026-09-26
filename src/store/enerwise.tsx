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

interface EnerwiseContextValue {
  user: User | null;
  authReady: boolean;
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
      return;
    }
    let cancelled = false;
    (async () => {
      const [c, u, t] = await Promise.all([
        supabase.from("contracts").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("usage").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("tariffs").select("*"),
      ]);
      if (cancelled) return;
      setContractState(
        c.data
          ? {
              supplier: c.data.supplier as Contract["supplier"],
              tariffType: c.data.tariff_type as Contract["tariffType"],
              pricePerKwh: Number(c.data.price_per_kwh),
              pricePerGas: Number(c.data.price_per_gas),
              contractEndDate: c.data.contract_end_date ?? "",
              exitFee: Number(c.data.exit_fee),
              exitFeeCondition: c.data.exit_fee_condition,
            }
          : DEFAULT_CONTRACT,
      );
      setUsageState(
        u.data
          ? {
              monthlyElectricity: Number(u.data.monthly_electricity),
              monthlyGas: Number(u.data.monthly_gas),
            }
          : DEFAULT_USAGE,
      );
      if (t.data?.length) {
        setOffers(
          t.data.map((r) => ({
            supplier: r.supplier,
            kwhPrice: Number(r.kwh_price),
            gasPrice: Number(r.gas_price),
            contractLength: r.contract_length,
            promo: Number(r.promo),
          })),
        );
      }
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
    [user, authReady, dataReady, contract, usage, offers, version, setContract, setUsage, reset, recommendation],
  );

  return <EnerwiseContext.Provider value={value}>{children}</EnerwiseContext.Provider>;
}

export function useEnerwise(): EnerwiseContextValue {
  const ctx = useContext(EnerwiseContext);
  if (!ctx) throw new Error("useEnerwise must be used within an EnerwiseProvider");
  return ctx;
}
