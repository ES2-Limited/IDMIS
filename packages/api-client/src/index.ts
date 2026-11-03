import type {
  SignInInput,
  SignInResponse,
  TotpVerifyInput,
  TotpSetupInput,
  TotpSetupResponse,
  RefreshTokenResponse,
  AuthMeResponse,
  UserAbilitiesResponse,
  SignOutResponse,
} from '@idmis/contracts';

export interface ApiClientOptions {
  baseUrl?: string;
  getAccessToken?: () => string | null;
  setAccessToken?: (token: string | null) => void;
  onUnauthorized?: () => void;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
    message?: string,
  ) {
    super(message ?? `API Error ${status}`);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private baseUrl: string;
  private getAccessTokenFn: () => string | null;
  private setAccessTokenFn: (token: string | null) => void;
  private onUnauthorizedFn?: () => void;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.getAccessTokenFn = options.getAccessToken ?? (() => null);
    this.setAccessTokenFn = options.setAccessToken ?? (() => {});
    this.onUnauthorizedFn = options.onUnauthorized;
  }

  public setAccessToken(token: string | null): void {
    this.setAccessTokenFn(token);
  }

  public getAccessToken(): string | null {
    return this.getAccessTokenFn();
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit = {},
    retryOn401 = true,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = this.getAccessToken();

    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (response.status === 401 && retryOn401) {
      const refreshedToken = await this.performRefresh();
      if (refreshedToken) {
        return this.request<T>(endpoint, init, false);
      }
      this.onUnauthorizedFn?.();
      throw new ApiError(401, null, 'Session expired');
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new ApiError(response.status, errorBody);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private async performRefresh(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshUrl = `${this.baseUrl}/auth/refresh`;
        const res = await fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          credentials: 'include',
        });

        if (!res.ok) {
          this.setAccessToken(null);
          return null;
        }

        const data = (await res.json()) as RefreshTokenResponse;
        this.setAccessToken(data.accessToken);
        return data.accessToken;
      } catch {
        this.setAccessToken(null);
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Auth Endpoints
  public async signIn(body: SignInInput): Promise<SignInResponse> {
    const res = await this.request<SignInResponse>(
      '/auth/sign-in',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      false,
    );
    if (res.status === 'authenticated') {
      this.setAccessToken(res.accessToken);
    }
    return res;
  }

  public async verifyTotp(body: TotpVerifyInput): Promise<SignInResponse> {
    const res = await this.request<SignInResponse>(
      '/auth/totp/verify',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      false,
    );
    if (res.status === 'authenticated') {
      this.setAccessToken(res.accessToken);
    }
    return res;
  }

  public async setupTotp(body: TotpSetupInput): Promise<TotpSetupResponse> {
    return this.request<TotpSetupResponse>('/auth/totp/setup', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async refresh(): Promise<RefreshTokenResponse> {
    const res = await this.request<RefreshTokenResponse>(
      '/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      false,
    );
    this.setAccessToken(res.accessToken);
    return res;
  }

  public async signOut(): Promise<SignOutResponse> {
    try {
      return await this.request<SignOutResponse>(
        '/auth/sign-out',
        {
          method: 'POST',
        },
        false,
      );
    } finally {
      this.setAccessToken(null);
    }
  }

  public async getMe(): Promise<AuthMeResponse> {
    return this.request<AuthMeResponse>('/auth/me');
  }

  public async getAbilities(): Promise<UserAbilitiesResponse> {
    return this.request<UserAbilitiesResponse>('/auth/me/abilities');
  }

  // Generic request wrappers
  public get<T>(url: string, init?: RequestInit): Promise<T> {
    return this.request<T>(url, { ...init, method: 'GET' });
  }

  public post<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(url, {
      ...init,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public put<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(url, {
      ...init,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public patch<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(url, {
      ...init,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  public delete<T>(url: string, init?: RequestInit): Promise<T> {
    return this.request<T>(url, { ...init, method: 'DELETE' });
  }
}

let defaultClient: ApiClient | null = null;

export function getApiClient(options?: ApiClientOptions): ApiClient {
  if (!defaultClient) {
    let memoryToken: string | null = null;
    let envBaseUrl = '/api';
    if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
      const proc = (
        globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
      ).process;
      if (proc?.env?.VITE_API_URL) {
        envBaseUrl = proc.env.VITE_API_URL;
      }
    }
    defaultClient = new ApiClient({
      baseUrl: envBaseUrl,
      getAccessToken: () => memoryToken,
      setAccessToken: (t) => {
        memoryToken = t;
      },
      ...options,
    });
  }
  return defaultClient;
}
