'use client';

import { type AuthUser, authUserSchema, hasPermission, type Permission } from '@sms/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { api, setSessionExpiredHandler } from './api';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

interface AuthContextValue {
  user: AuthUser;
  /** Mirrors the API's permission guard for hiding/disabling UI (spec §3). */
  can: (permission: Permission) => boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const loginPath = (next?: string) =>
  next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login';

/** Loads the signed-in user; redirects to /login when there's no valid session. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const { data: user, isError } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get('/auth/me', authUserSchema),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const goToLogin = useCallback(() => {
    queryClient.clear();
    router.replace(loginPath(pathname));
  }, [queryClient, router, pathname]);

  useEffect(() => {
    setSessionExpiredHandler(goToLogin);
    return () => setSessionExpiredHandler(undefined);
  }, [goToLogin]);

  useEffect(() => {
    if (isError) goToLogin();
  }, [isError, goToLogin]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout', z.undefined()).catch(() => undefined);
    queryClient.clear();
    router.replace('/login');
  }, [queryClient, router]);

  const value = useMemo<AuthContextValue | null>(
    () => (user ? { user, can: (p) => hasPermission(user.role, p), logout } : null),
    [user, logout],
  );

  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
