import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { reconnectSocket } from "@/lib/socket";
import type { User } from "@/lib/types";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  country?: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>("/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const afterAuthChange = useCallback(
    (user: User | null) => {
      qc.setQueryData(["auth", "me"], user);
      // Viewer-specific data (watching, max bid, my bids) must be refetched.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
      reconnectSocket();
    },
    [qc],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api.post<{ user: User }>("/auth/login", { email, password });
      afterAuthChange(user);
      return user;
    },
    [afterAuthChange],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { user } = await api.post<{ user: User }>("/auth/register", input);
      afterAuthChange(user);
      return user;
    },
    [afterAuthChange],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    afterAuthChange(null);
    qc.removeQueries({ queryKey: ["me"] });
  }, [afterAuthChange, qc]);

  const value = useMemo(
    () => ({ user: me.data ?? null, loading: me.isLoading, login, register, logout }),
    [me.data, me.isLoading, login, register, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
