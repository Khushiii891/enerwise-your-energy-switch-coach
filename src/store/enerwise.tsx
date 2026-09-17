import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Contract, Recommendation, Usage } from "@/lib/types";
import { DEFAULT_CONTRACT, DEFAULT_USAGE } from "@/lib/market-data";
import { buildRecommendation } from "@/lib/calc";

const CONTRACT_KEY = "enerwise:contract";
const USAGE_KEY = "enerwise:usage";

interface EnerwiseContextValue {
  contract: Contract;
  usage: Usage;
  setContract: (next: Contract) => void;
  setUsage: (next: Usage) => void;
  reset: () => void;
  recommendation: Recommendation;
}

const EnerwiseContext = createContext<EnerwiseContextValue | null>(null);

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) } as T;
  } catch {
    return fallback;
  }
}

export function EnerwiseProvider({ children }: { children: ReactNode }) {
  // Seed with defaults so SSR renders identical markup to the first client paint.
  const [contract, setContractState] = useState<Contract>(DEFAULT_CONTRACT);
  const [usage, setUsageState] = useState<Usage>(DEFAULT_USAGE);

  // Hydrate from localStorage after mount (prototype persistence).
  useEffect(() => {
    setContractState(loadJSON(CONTRACT_KEY, DEFAULT_CONTRACT));
    setUsageState(loadJSON(USAGE_KEY, DEFAULT_USAGE));
  }, []);

  const setContract = useCallback((next: Contract) => {
    setContractState(next);
    try {
      window.localStorage.setItem(CONTRACT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const setUsage = useCallback((next: Usage) => {
    setUsageState(next);
    try {
      window.localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => {
    setContract(DEFAULT_CONTRACT);
    setUsage(DEFAULT_USAGE);
  }, [setContract, setUsage]);

  const recommendation = useMemo(
    () => buildRecommendation(contract, usage),
    [contract, usage],
  );

  const value = useMemo<EnerwiseContextValue>(
    () => ({ contract, usage, setContract, setUsage, reset, recommendation }),
    [contract, usage, setContract, setUsage, reset, recommendation],
  );

  return (
    <EnerwiseContext.Provider value={value}>{children}</EnerwiseContext.Provider>
  );
}

export function useEnerwise(): EnerwiseContextValue {
  const ctx = useContext(EnerwiseContext);
  if (!ctx) {
    throw new Error("useEnerwise must be used within an EnerwiseProvider");
  }
  return ctx;
}
