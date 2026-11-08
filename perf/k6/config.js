/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export const NATIONAL_USER = {
  email: __ENV.NATIONAL_USER_EMAIL || '',
  password: __ENV.NATIONAL_USER_PASSWORD || '',
};

export const STATE_USER = {
  email: __ENV.STATE_USER_EMAIL || '',
  password: __ENV.STATE_USER_PASSWORD || '',
};

export const SCHEME_USER = {
  email: __ENV.SCHEME_USER_EMAIL || '',
  password: __ENV.SCHEME_USER_PASSWORD || '',
};

/**
 * PROVISIONAL THRESHOLDS — PENDING CLIENT CONFIRMATION
 * Targets:
 * - List endpoints: p95 under 500 ms with 1M farmers.
 * - sync push (batch of 200 changes) p95 < 2 s (provisional)
 * - sync pull (500 changes) p95 < 1.5 s (provisional)
 * - import of 100,000 rows validated and committed in < 10 minutes (provisional)
 */
export const PROVISIONAL_THRESHOLDS = {
  list: {
    'http_req_duration{name:farmer_list_national_paged}': ['p(95)<500'],
    'http_req_duration{name:farmer_search}': ['p(95)<500'],
    'http_req_duration{name:farmer_list_state_paged}': ['p(95)<500'],
    'http_req_duration{name:farmer_list_scheme_paged}': ['p(95)<500'],
    'http_req_duration{name:plot_list_national_paged}': ['p(95)<500'],
    'http_req_duration{name:plot_search}': ['p(95)<500'],
    'http_req_duration{name:plot_filtered_service}': ['p(95)<500'],
    'http_req_duration{name:plot_list_state_paged}': ['p(95)<500'],
    'http_req_duration{name:plot_list_scheme_paged}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
  sync: {
    'http_req_duration{endpoint:sync_push}': ['p(95)<2000'],
    'http_req_duration{endpoint:sync_pull}': ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
  import: {
    'http_req_duration{endpoint:import_commit}': ['p(95)<600000'],
    http_req_failed: ['rate<0.01'],
  },
};

/**
 * Authenticates user and returns JWT access token
 */
export function authenticate(baseUrl, credentials) {
  if (!credentials.email || !credentials.password) {
    throw new Error(
      'Missing credentials: NATIONAL_USER_EMAIL / NATIONAL_USER_PASSWORD (or STATE_USER_EMAIL / STATE_USER_PASSWORD) must be provided in environment variables',
    );
  }

  const payload = JSON.stringify({
    email: credentials.email,
    password: credentials.password,
  });

  const res = http.post(`${baseUrl}/auth/sign-in`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Origin: __ENV.APP_URL || 'http://localhost:5173',
    },
    tags: { name: 'auth_sign_in' },
  });

  const ok = check(res, {
    'sign-in returned 200': (r) => r.status === 200,
    'sign-in returned authenticated': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'authenticated' && !!body.accessToken;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    throw new Error(
      `Authentication failed for ${credentials.email}: HTTP ${res.status} ${res.body}`,
    );
  }

  const json = JSON.parse(res.body);
  return json.accessToken;
}
