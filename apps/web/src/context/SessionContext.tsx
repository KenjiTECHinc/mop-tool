import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client.ts";
import { setLanguage } from "../i18n/index.ts";
import type { Me } from "../types.ts";

interface SessionValue {
  me: Me | null;
  refresh: () => Promise<void>;
  setUiLanguage: (language: "en" | "zh-TW") => Promise<void>;
}

const SessionContext = createContext<SessionValue>({ me: null, refresh: async () => undefined, setUiLanguage: async () => undefined });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.me();
      setMe(next);
      await setLanguage(next.preferredLanguage);
    } catch {
      setMe(null);
    }
  }, []);

  const setUiLanguage = useCallback(async (language: "en" | "zh-TW") => {
    await setLanguage(language);
    if (me) await api.setLanguage(language).catch(() => undefined);
  }, [me]);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  if (!ready) return null;
  return <SessionContext.Provider value={{ me, refresh, setUiLanguage }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
