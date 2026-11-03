import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError } from './index';

describe('ApiClient', () => {
  let client: ApiClient;
  let tokenStorage: string | null = null;

  beforeEach(() => {
    tokenStorage = null;
    vi.restoreAllMocks();
    client = new ApiClient({
      baseUrl: 'http://test.api',
      getAccessToken: () => tokenStorage,
      setAccessToken: (t) => {
        tokenStorage = t;
      },
    });
  });

  it('attaches Bearer token if present', async () => {
    tokenStorage = 'token-123';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await client.getMe();
    expect(res).toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test.api/auth/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const callHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(callHeaders.get('Authorization')).toBe('Bearer token-123');
  });

  it('performs refresh on 401 and retries', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ accessToken: 'new-token-456', expiresIn: 900, user: {} }),
        });
      }
      if (url.includes('/auth/me')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ message: 'Unauthorized' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: 'user-after-refresh' }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const me = await client.getMe();
    expect(me).toEqual({ id: 'user-after-refresh' });
    expect(tokenStorage).toBe('new-token-456');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws ApiError on non-401 failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.get('/fail')).rejects.toThrow(ApiError);
  });
});
