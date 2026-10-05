import { createContext, useContext, type ReactNode } from "react";
import type { Me, PublicConfig } from "../api/types";

export interface Session {
  me: Me;
  config: PublicConfig;
}

const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({ me, config, children }: { me: Me; config: PublicConfig; children: ReactNode }) {
  return <SessionCtx.Provider value={{ me, config }}>{children}</SessionCtx.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
