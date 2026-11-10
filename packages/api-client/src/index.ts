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
  // Core Contracts
  AppUserResponse,
  CreateAppUserInput,
  UpdateAppUserInput,
  ListAppUsersQuery,
  StateResponse,
  ListStatesQuery,
  LgaResponse,
  ListLgasQuery,
  WardResponse,
  ListWardsQuery,
  WuaResponse,
  ListWuasQuery,
  CreateWuaInput,
  OrganisationResponse,
  ListOrganisationsQuery,
  CreateOrganisationInput,
  // SLIS Contracts
  FarmerResponse,
  CreateFarmerInput,
  UpdateFarmerInput,
  ListFarmersQuery,
  PlotResponse,
  CreatePlotInput,
  UpdatePlotInput,
  ListPlotsQuery,
  SyncPushInput,
  SyncPushResponse,
  // BLIS Contracts
  Basin,
  ListBasinsQuery,
  CreateBasinInput,
  Station,
  ListStationsQuery,
  CreateStationInput,
  Dam,
  ListDamsQuery,
  CreateDamInput,
  DamSafetyInspection,
  CreateDamSafetyInspectionInput,
  ListDamInspectionsQuery,
  // M&E Contracts
  Indicator,
  BaseListQuery,
  IndicatorMatrixResponse,
  CreateIndicatorValueInput,
  IndicatorValue,
  DashboardResponse,
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

function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
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

  public setOnUnauthorized(cb: () => void): void {
    this.onUnauthorizedFn = cb;
  }

  public setGetAccessToken(cb: () => string | null): void {
    this.getAccessTokenFn = cb;
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

  // --- Auth Endpoints ---
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

  // --- Core / Geography Endpoints ---
  public async getStates(
    query?: ListStatesQuery,
  ): Promise<{ items: StateResponse[]; total?: number }> {
    return this.request<{ items: StateResponse[]; total?: number }>(
      `/geography/states${buildQueryString(query)}`,
    );
  }

  public async getLgas(query?: ListLgasQuery): Promise<{ items: LgaResponse[]; total?: number }> {
    return this.request<{ items: LgaResponse[]; total?: number }>(
      `/geography/lgas${buildQueryString(query)}`,
    );
  }

  public async getWards(
    query?: ListWardsQuery,
  ): Promise<{ items: WardResponse[]; total?: number }> {
    return this.request<{ items: WardResponse[]; total?: number }>(
      `/geography/wards${buildQueryString(query)}`,
    );
  }

  // --- Core / Users & Roles Endpoints ---
  public async getUsers(
    query?: ListAppUsersQuery,
  ): Promise<{ items: AppUserResponse[]; total?: number }> {
    return this.request<{ items: AppUserResponse[]; total?: number }>(
      `/admin/users${buildQueryString(query)}`,
    );
  }

  public async getUser(id: string): Promise<AppUserResponse> {
    return this.request<AppUserResponse>(`/admin/users/${id}`);
  }

  public async createUser(body: CreateAppUserInput): Promise<AppUserResponse> {
    return this.request<AppUserResponse>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async updateUser(id: string, body: UpdateAppUserInput): Promise<AppUserResponse> {
    return this.request<AppUserResponse>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  // --- Core / Organisations & WUAs ---
  public async getOrganisations(
    query?: ListOrganisationsQuery,
  ): Promise<{ items: OrganisationResponse[]; total?: number }> {
    return this.request<{ items: OrganisationResponse[]; total?: number }>(
      `/admin/organisations${buildQueryString(query)}`,
    );
  }

  public async createOrganisation(body: CreateOrganisationInput): Promise<OrganisationResponse> {
    return this.request<OrganisationResponse>('/admin/organisations', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async getWuas(query?: ListWuasQuery): Promise<{ items: WuaResponse[]; total?: number }> {
    return this.request<{ items: WuaResponse[]; total?: number }>(
      `/wuas${buildQueryString(query)}`,
    );
  }

  public async createWua(body: CreateWuaInput): Promise<WuaResponse> {
    return this.request<WuaResponse>('/wuas', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // --- SLIS / Farmers & Plots Endpoints ---
  public async getFarmers(
    query?: ListFarmersQuery,
  ): Promise<{ items: FarmerResponse[]; total?: number }> {
    return this.request<{ items: FarmerResponse[]; total?: number }>(
      `/slis/farmers${buildQueryString(query)}`,
    );
  }

  public async getFarmer(id: string): Promise<FarmerResponse> {
    return this.request<FarmerResponse>(`/slis/farmers/${id}`);
  }

  public async createFarmer(body: CreateFarmerInput): Promise<FarmerResponse> {
    return this.request<FarmerResponse>('/slis/farmers', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async updateFarmer(id: string, body: UpdateFarmerInput): Promise<FarmerResponse> {
    return this.request<FarmerResponse>(`/slis/farmers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  public async getPlots(
    query?: ListPlotsQuery,
  ): Promise<{ items: PlotResponse[]; total?: number }> {
    return this.request<{ items: PlotResponse[]; total?: number }>(
      `/slis/plots${buildQueryString(query)}`,
    );
  }

  public async getPlot(id: string): Promise<PlotResponse> {
    return this.request<PlotResponse>(`/slis/plots/${id}`);
  }

  public async createPlot(body: CreatePlotInput): Promise<PlotResponse> {
    return this.request<PlotResponse>('/slis/plots', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async updatePlot(id: string, body: UpdatePlotInput): Promise<PlotResponse> {
    return this.request<PlotResponse>(`/slis/plots/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  public async pushSync(body: SyncPushInput): Promise<SyncPushResponse> {
    return this.request<SyncPushResponse>('/slis/sync/push', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // --- BLIS Endpoints ---
  public async getBasins(query?: ListBasinsQuery): Promise<{ items: Basin[]; total?: number }> {
    return this.request<{ items: Basin[]; total?: number }>(
      `/blis/basins${buildQueryString(query)}`,
    );
  }

  public async createBasin(body: CreateBasinInput): Promise<Basin> {
    return this.request<Basin>('/blis/basins', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async getStations(
    query?: ListStationsQuery,
  ): Promise<{ items: Station[]; total?: number }> {
    return this.request<{ items: Station[]; total?: number }>(
      `/blis/stations${buildQueryString(query)}`,
    );
  }

  public async createStation(body: CreateStationInput): Promise<Station> {
    return this.request<Station>('/blis/stations', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async getDams(query?: ListDamsQuery): Promise<{ items: Dam[]; total?: number }> {
    return this.request<{ items: Dam[]; total?: number }>(`/blis/dams${buildQueryString(query)}`);
  }

  public async createDam(body: CreateDamInput): Promise<Dam> {
    return this.request<Dam>('/blis/dams', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async getDamInspections(
    query?: ListDamInspectionsQuery,
  ): Promise<{ items: DamSafetyInspection[]; total?: number }> {
    return this.request<{ items: DamSafetyInspection[]; total?: number }>(
      `/blis/dam-inspections${buildQueryString(query)}`,
    );
  }

  public async createDamInspection(
    body: CreateDamSafetyInspectionInput,
  ): Promise<DamSafetyInspection> {
    return this.request<DamSafetyInspection>('/blis/dam-inspections', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // --- M&E Endpoints ---
  public async getIndicators(
    query?: BaseListQuery,
  ): Promise<{ items: Indicator[]; total?: number }> {
    return this.request<{ items: Indicator[]; total?: number }>(
      `/me/indicators${buildQueryString(query)}`,
    );
  }

  public async getIndicatorMatrix(): Promise<IndicatorMatrixResponse> {
    return this.request<IndicatorMatrixResponse>('/me/values/matrix');
  }

  public async submitQuarterlyValue(body: CreateIndicatorValueInput): Promise<IndicatorValue> {
    return this.request<IndicatorValue>('/me/values/quarterly', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // --- Dashboard Endpoints ---
  public async getProgrammeDashboard(query?: Record<string, unknown>): Promise<DashboardResponse> {
    return this.request<DashboardResponse>(`/dashboards/programme${buildQueryString(query)}`);
  }

  public async getStateDashboard(
    stateId: string,
    query?: Record<string, unknown>,
  ): Promise<DashboardResponse> {
    return this.request<DashboardResponse>(
      `/dashboards/state/${stateId}${buildQueryString(query)}`,
    );
  }

  public async getSchemeDashboard(
    schemeId: string,
    query?: Record<string, unknown>,
  ): Promise<DashboardResponse> {
    return this.request<DashboardResponse>(
      `/dashboards/scheme/${schemeId}${buildQueryString(query)}`,
    );
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

  if (!defaultClient) {
    defaultClient = new ApiClient({
      baseUrl: envBaseUrl,
      getAccessToken: () => {
        if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
          return sessionStorage.getItem('idmis_access_token');
        }
        return memoryToken;
      },
      setAccessToken: (t) => {
        memoryToken = t;
        if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
          if (t) sessionStorage.setItem('idmis_access_token', t);
          else sessionStorage.removeItem('idmis_access_token');
        }
      },
      ...options,
    });
  } else if (options) {
    if (options.getAccessToken) {
      defaultClient.setGetAccessToken(options.getAccessToken);
    }
    if (options.setAccessToken) {
      defaultClient.setAccessToken = options.setAccessToken;
    }
    if (options.onUnauthorized) {
      defaultClient.setOnUnauthorized(options.onUnauthorized);
    }
  }
  return defaultClient;
}
