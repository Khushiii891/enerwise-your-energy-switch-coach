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
import type {
  Contract,
  ControlSettings,
  MarketOffer,
  PlannedSwitch,
  Recommendation,
  SavingsResult,
  Usage,
} from "@/lib/types";
import { DEFAULT_CONTRACT, DEFAULT_CONTROL, DEFAULT_USAGE } from "@/lib/market-data";
import { buildRecommendation, pickAutoSwitch } from "@/lib/calc";
import { supabase } from "@/integrations/supabase/client";
import {
  contractFromRow,
  controlFromRow,
  loadOffers,
  switchFromRow,
  usageFromRow,
} from "@/lib/db-mappers";

interface EnerwiseContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  dataReady: boolean;
  contract: Contract;
  usage: Usage;
  /** Live scraped offers only; empty until loaded or when no live prices exist. */
  offers: MarketOffer[];
  /** True once the user has saved their own contract AND usage (no placeholder numbers). */
  profileComplete: boolean;
  /** Bumps whenever saved data changes, so the AI explanation can refresh. */
  version: number;
  setContract: (next: Contract) => Promise<void>;
  setUsage: (next: Usage) => Promise<void>;
  recommendation: Recommendation;
  control: ControlSettings;
  /** False until the user has chosen a mode at least once. */
  controlSaved: boolean;
  setControl: (next: ControlSettings) => Promise<void>;
  /** Latest simulated switch (only exposed in automatic mode). */
  latestSwitch: PlannedSwitch | null;
  cancelSwitch: () => Promise<void>;
  refreshSwitch: () => void;
  autoCandidate: SavingsResult | null;
}

const EnerwiseContext = createContext<EnerwiseContextValue | null>(null);

export function EnerwiseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [contract, setContractState] = useState<Contract>(DEFAULT_CONTRACT);
  const [usage, setUsageState] = useState<Usage>(DEFAULT_USAGE);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [contractSaved, setContractSaved] = useState(false);
  const [usageSaved, setUsageSaved] = useState(false);
  const [version, setVersion] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [control, setControlState] = useState<ControlSettings>(DEFAULT_CONTROL);
  const [controlSaved, setControlSaved] = useState(false);
  const [latestSwitch, setLatestSwitch] = useState<PlannedSwitch | null>(null);

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
      const [c, u, t, cs, ps] = await Promise.all([
        supabase.from("contracts").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("usage").select("*").eq("user_id", userId).maybeSingle(),
        loadOffers(supabase),
        supabase.from("control_settings").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("planned_switches")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setContractState(c.data ? contractFromRow(c.data) : DEFAULT_CONTRACT);
      setUsageState(u.data ? usageFromRow(u.data) : DEFAULT_USAGE);
      setContractSaved(!!c.data);
      setUsageSaved(!!u.data);
      setOffers(t);
      setControlState(cs.data ? controlFromRow(cs.data) : DEFAULT_CONTROL);
      setControlSaved(!!cs.data);
      setLatestSwitch(ps.data ? switchFromRow(ps.data) : null);
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
        fixed_fee_month: next.fixedFeeMonth,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setContractSaved(true);
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
        estimate_used: !!(next.hasSolar && next.estimate),
        panel_count: next.hasSolar ? next.estimate?.panels ?? null : null,
        panel_wattage: next.hasSolar ? next.estimate?.wattage ?? null : null,
        orientation: next.hasSolar ? next.estimate?.orientation ?? null : null,
        shading: next.hasSolar ? next.estimate?.shading ?? null : null,
        has_battery: next.hasSolar ? next.estimate?.hasBattery ?? null : null,
        total_usage_kwh: next.hasSolar ? next.estimate?.totalUsage ?? null : null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setUsageSaved(true);
      setVersion((v) => v + 1);
    },
    [userId],
  );

  const recommendation = useMemo(
    () => buildRecommendation(contract, usage, offers),
    [contract, usage, offers],
  );

  const setControl = useCallback(
    async (next: ControlSettings) => {
      if (!userId) return;
      const { error } = await supabase.from("control_settings").upsert({
        user_id: userId,
        mode: next.mode,
        min_savings: next.minSavings,
        allowed_types: next.allowedTypes,
        excluded_suppliers: next.excludedSuppliers,
        cancel_window_days: next.cancelWindowDays,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      // Leaving automatic mode (or changing conditions) cancels any pending simulated switch.
      if (latestSwitch?.status === "planned") {
        const { data } = await supabase
          .from("planned_switches")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", latestSwitch.id)
          .select("*")
          .single();
        if (data) setLatestSwitch(next.mode === "auto" ? null : switchFromRow(data));
      }
      setControlState(next);
      setControlSaved(true);
      setVersion((v) => v + 1);
    },
    [userId, latestSwitch],
  );

  const cancelSwitch = useCallback(async () => {
    if (!latestSwitch || latestSwitch.status !== "planned") return;
    const { data, error } = await supabase
      .from("planned_switches")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", latestSwitch.id)
      .select("*")
      .single();
    if (error) throw error;
    setLatestSwitch(switchFromRow(data));
    setVersion((v) => v + 1);
  }, [latestSwitch]);

  const profileComplete = contractSaved && usageSaved;
  // Never plan a switch from placeholder numbers: the user's own contract and usage are required.
  const autoCandidate = useMemo(
    () => (control.mode === "auto" && profileComplete ? pickAutoSwitch(recommendation, control) : null),
    [control, recommendation, profileComplete],
  );

  /** Simulation engine: complete expired switches, plan new ones when conditions are met. */
  const [tick, setTick] = useState(0);
  const refreshSwitch = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!userId || !dataReady || control.mode !== "auto") return;
    let cancelled = false;
    (async () => {
      const s = latestSwitch;
      if (s?.status === "planned") {
        if (new Date(s.plannedDate).getTime() <= Date.now()) {
          const { data } = await supabase
            .from("planned_switches")
            .update({ status: "completed" })
            .eq("id", s.id)
            .eq("status", "planned")
            .select("*")
            .maybeSingle();
          if (!cancelled && data) {
            setLatestSwitch(switchFromRow(data));
            setVersion((v) => v + 1);
          }
        }
        return;
      }
      if (s?.status === "completed") return;
      if (!autoCandidate) return;
      // Don't re-plan the same supplier right after the user cancelled it.
      if (s?.status === "cancelled" && s.supplier === autoCandidate.offer.supplier) return;
      const planned = new Date(Date.now() + control.cancelWindowDays * 86400000).toISOString();
      const { data } = await supabase
        .from("planned_switches")
        .insert({
          user_id: userId,
          supplier: autoCandidate.offer.supplier,
          net_savings: Math.round(autoCandidate.netSavings * 100) / 100,
          planned_date: planned,
        })
        .select("*")
        .single();
      if (!cancelled && data) {
        setLatestSwitch(switchFromRow(data));
        setVersion((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, dataReady, control, autoCandidate, latestSwitch, tick]);

  const value = useMemo<EnerwiseContextValue>(
    () => ({
      user,
      authReady,
      isAdmin,
      dataReady,
      profileComplete,
      contract,
      usage,
      offers,
      version,
      setContract,
      setUsage,
      recommendation,
      control,
      controlSaved,
      setControl,
      latestSwitch: control.mode === "auto" ? latestSwitch : null,
      cancelSwitch,
      refreshSwitch,
      autoCandidate,
    }),
    [user, authReady, isAdmin, dataReady, profileComplete, contract, usage, offers, version, setContract, setUsage, recommendation, control, controlSaved, setControl, latestSwitch, cancelSwitch, refreshSwitch, autoCandidate],
  );

  return <EnerwiseContext.Provider value={value}>{children}</EnerwiseContext.Provider>;
}

export function useEnerwise(): EnerwiseContextValue {
  const ctx = useContext(EnerwiseContext);
  if (!ctx) throw new Error("useEnerwise must be used within an EnerwiseProvider");
  return ctx;
}
