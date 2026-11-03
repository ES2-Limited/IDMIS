import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type {
  AuthMeResponse,
  SignInInput,
  SignInResponse,
  TotpVerifyInput,
} from '@idmis/contracts';
import { getApiClient, ApiClient } from '@idmis/api-client';
import { isMockEnabled } from '../mocks/config';

export interface AuthContextValue {
  user: AuthMeResponse | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (input: SignInInput) => Promise<SignInResponse>;
  verifyTotp: (input: TotpVerifyInput) => Promise<SignInResponse>;
  signOut: () => Promise<void>;
  client: ApiClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_TOKEN_KEY = 'idmis_access_token';

// Seed mock user for development and testing
export const MOCK_SUPERADMIN: AuthMeResponse = {
  id: 'a0000000-0000-0000-0000-000000000001',
  email: 'admin@idmis.gov.ng',
  fullName: 'Super Administrator',
  phone: '+2348000000001',
  mustChangePassword: false,
  isSystemAdmin: true,
  totpEnabled: true,
  roles: ['superadmin'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const MOCK_PERMISSIONS: string[] = [
  '*',
  'core.user.read',
  'core.user.write',
  'slis.farmer.read',
  'slis.farmer.create',
  'slis.farmer.update',
  'slis.farm.read',
  'slis.farm.create',
  'slis.water.read',
  'slis.water.create',
  'slis.import.read',
  'slis.import.create',
  'me.kpi.read',
  'me.survey.read',
  'blis.irrigation.read',
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(STORAGE_TOKEN_KEY);
    }
    return null;
  });

  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const setToken = useCallback((newToken: string | null) => {
    setTokenState(newToken);
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      if (newToken) {
        sessionStorage.setItem(STORAGE_TOKEN_KEY, newToken);
      } else {
        sessionStorage.removeItem(STORAGE_TOKEN_KEY);
      }
    }
  }, []);

  const apiClient = useMemo(() => {
    return getApiClient({
      getAccessToken: () => token,
      setAccessToken: setToken,
      onUnauthorized: () => {
        setUser(null);
        setPermissions([]);
        setToken(null);
      },
    });
  }, [token, setToken]);

  // Load session on startup
  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      setIsLoading(true);
      setError(null);

      if (isMockEnabled('auth')) {
        // Mock authentication enabled
        if (token || sessionStorage.getItem(STORAGE_TOKEN_KEY)) {
          setUser(MOCK_SUPERADMIN);
          setPermissions(MOCK_PERMISSIONS);
        } else {
          setUser(null);
          setPermissions([]);
        }
        setIsLoading(false);
        return;
      }

      // Real auth flow
      try {
        if (!token) {
          // Attempt silent refresh via cookie
          const refreshRes = await apiClient.refresh().catch(() => null);
          if (refreshRes) {
            setToken(refreshRes.accessToken);
            if (!cancelled) {
              setUser(refreshRes.user);
              const abilities = await apiClient.getAbilities().catch(() => null);
              if (abilities) setPermissions(abilities.permissions);
            }
            return;
          }
        } else {
          const [me, abilities] = await Promise.all([
            apiClient.getMe(),
            apiClient.getAbilities().catch(() => null),
          ]);
          if (!cancelled) {
            setUser(me);
            if (abilities) setPermissions(abilities.permissions);
          }
          return;
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setPermissions([]);
          setToken(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      cancelled = true;
    };
  }, [token, apiClient, setToken]);

  const signIn = useCallback(
    async (input: SignInInput): Promise<SignInResponse> => {
      setError(null);
      if (isMockEnabled('auth')) {
        // In mock mode: if admin, require TOTP first to demonstrate full flow
        if (input.email.includes('admin') && !input.platform?.includes('skip-totp')) {
          return {
            status: 'totp_required',
            tempToken: 'mock-temp-token-xyz',
          };
        }
        const mockAuthResponse: SignInResponse = {
          status: 'authenticated',
          accessToken: 'mock-jwt-token-12345',
          expiresIn: 3600,
          user: {
            ...MOCK_SUPERADMIN,
            email: input.email,
          },
        };
        setToken('mock-jwt-token-12345');
        setUser(mockAuthResponse.user);
        setPermissions(MOCK_PERMISSIONS);
        return mockAuthResponse;
      }

      const res = await apiClient.signIn(input);
      if (res.status === 'authenticated') {
        setToken(res.accessToken);
        setUser(res.user);
        const abilities = await apiClient.getAbilities().catch(() => null);
        if (abilities) setPermissions(abilities.permissions);
      }
      return res;
    },
    [apiClient, setToken],
  );

  const verifyTotp = useCallback(
    async (input: TotpVerifyInput): Promise<SignInResponse> => {
      setError(null);
      if (isMockEnabled('auth')) {
        if (input.totpCode !== '123456') {
          throw new Error('Invalid code. For test mode, use 123456');
        }
        const mockAuthResponse: SignInResponse = {
          status: 'authenticated',
          accessToken: 'mock-jwt-token-12345',
          expiresIn: 3600,
          user: MOCK_SUPERADMIN,
        };
        setToken('mock-jwt-token-12345');
        setUser(mockAuthResponse.user);
        setPermissions(MOCK_PERMISSIONS);
        return mockAuthResponse;
      }

      const res = await apiClient.verifyTotp(input);
      if (res.status === 'authenticated') {
        setToken(res.accessToken);
        setUser(res.user);
        const abilities = await apiClient.getAbilities().catch(() => null);
        if (abilities) setPermissions(abilities.permissions);
      }
      return res;
    },
    [apiClient, setToken],
  );

  const signOut = useCallback(async () => {
    try {
      if (!isMockEnabled('auth')) {
        await apiClient.signOut();
      }
    } finally {
      setUser(null);
      setPermissions([]);
      setToken(null);
    }
  }, [apiClient, setToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      isAuthenticated: Boolean(user),
      isLoading,
      error,
      signIn,
      verifyTotp,
      signOut,
      client: apiClient,
    }),
    [user, permissions, isLoading, error, signIn, verifyTotp, signOut, apiClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
