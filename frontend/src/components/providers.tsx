"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { api } from "@/lib/api";
import type { Currency, RateCategory, User } from "@/lib/types";

// --- Price preferences (currency + resident/non-resident) --------------------------

type Prefs = { currency: Currency; rate: RateCategory };
const PREFS_KEY = "sn_prefs";
const DEFAULT_PREFS: Prefs = { currency: "KES", rate: "resident" };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedPrefs: Prefs = DEFAULT_PREFS;

function readPrefs(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    /* ignore */
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedPrefs = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
    } catch {
      cachedPrefs = DEFAULT_PREFS;
    }
  }
  return cachedPrefs;
}

function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function usePrefs() {
  const prefs = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readPrefs,
    () => DEFAULT_PREFS,
  );
  const setPrefs = useCallback((next: Partial<Prefs>) => writePrefs({ ...readPrefs(), ...next }), []);
  return { ...prefs, setPrefs };
}

// --- Session ----------------------------------------------------------------------

export function useSession() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User | null>("/api/auth/session"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const client = useQueryClient();
  return {
    user: query.data ?? null,
    loading: query.isLoading,
    setUser: (u: User | null) => client.setQueryData(["me"], u),
    refresh: () => client.invalidateQueries({ queryKey: ["me"] }),
  };
}

// --- Theme ------------------------------------------------------------------------

type Theme = "light" | "dark" | "system";
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
});

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export const useTheme = () => useContext(ThemeContext);

/** True when dark styles are applied right now (explicit choice or the system setting). */
export function useIsDark() {
  return useSyncExternalStore(
    (cb) => {
      const observer = new MutationObserver(cb);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
      }),
  );
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    try {
      return (localStorage.getItem("sn_theme") as Theme) ?? "system";
    } catch {
      return "system";
    }
  });
  const themeValue = useMemo(
    () => ({
      theme,
      setTheme: (t: Theme) => {
        setThemeState(t);
        try {
          localStorage.setItem("sn_theme", t);
        } catch {
          /* ignore */
        }
        applyTheme(t);
      },
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <QueryClientProvider client={client}>
        {children}
        <Toaster richColors position="top-center" closeButton />
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}
