import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  NATIONAL_USER,
  STATE_USER,
  SCHEME_USER,
  PROVISIONAL_THRESHOLDS,
  authenticate,
} from './config.js';

export const options = {
  scenarios: {
    national_lists: {
      executor: 'constant-vus',
      vus: 7,
      duration: '60s',
      exec: 'testNationalLists',
    },
    state_lists: {
      executor: 'constant-vus',
      vus: 7,
      duration: '60s',
      exec: 'testStateLists',
    },
    scheme_lists: {
      executor: 'constant-vus',
      vus: 6,
      duration: '60s',
      exec: 'testSchemeLists',
    },
  },
  thresholds: PROVISIONAL_THRESHOLDS.list,
};

export function setup() {
  const nationalToken = authenticate(BASE_URL, NATIONAL_USER);
  const stateToken = authenticate(BASE_URL, STATE_USER);
  const schemeToken = authenticate(BASE_URL, SCHEME_USER);
  return { nationalToken, stateToken, schemeToken };
}

export function testNationalLists(data) {
  const headers = {
    Authorization: `Bearer ${data.nationalToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Farmer List - Page 1
  const fRes1 = http.get(`${BASE_URL}/slis/farmers?limit=50&status=approved`, {
    headers,
    tags: { name: 'farmer_list_national_paged' },
  });
  check(fRes1, {
    'national farmer list p1 is 200': (r) => r.status === 200,
    'national farmer list items present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        /* empty */
        return false;
      }
    },
  });

  const body1 = JSON.parse(fRes1.body);
  const nextCursor = body1.nextCursor;

  // 2. Farmer List - Page 2 (cursor-based pagination)
  if (nextCursor) {
    const fRes2 = http.get(
      `${BASE_URL}/slis/farmers?limit=50&status=approved&cursor=${encodeURIComponent(nextCursor)}`,
      {
        headers,
        tags: { name: 'farmer_list_national_paged' },
      },
    );
    check(fRes2, {
      'national farmer list p2 is 200': (r) => r.status === 200,
    });
  }

  // 3. Farmer List - Filtered by search
  const fResFiltered = http.get(`${BASE_URL}/slis/farmers?limit=50&search=Amina`, {
    headers,
    tags: { name: 'farmer_search' },
  });
  check(fResFiltered, {
    'national farmer list search is 200': (r) => r.status === 200,
  });

  // 4. Plot List - Page 1
  const pRes1 = http.get(`${BASE_URL}/slis/plots?limit=50&status=approved`, {
    headers,
    tags: { name: 'plot_list_national_paged' },
  });
  check(pRes1, {
    'national plot list p1 is 200': (r) => r.status === 200,
    'national plot list items present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        /* empty */
        return false;
      }
    },
  });

  // 5. Plot List - Filtered by serviceType
  const pResFiltered = http.get(`${BASE_URL}/slis/plots?limit=50&serviceType=new`, {
    headers,
    tags: { name: 'plot_filtered_service' },
  });
  check(pResFiltered, {
    'national plot list filtered is 200': (r) => r.status === 200,
  });

  // 6. Plot List - Search by plot code substring
  const pResSearch = http.get(`${BASE_URL}/slis/plots?limit=50&search=PLT-KAN`, {
    headers,
    tags: { name: 'plot_search' },
  });
  check(pResSearch, {
    'national plot list search is 200': (r) => r.status === 200,
  });

  sleep(0.5);
}

export function testStateLists(data) {
  const headers = {
    Authorization: `Bearer ${data.stateToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Farmer List - State-scoped (automatically restricted to user's assigned state)
  const fRes = http.get(`${BASE_URL}/slis/farmers?limit=50&status=approved`, {
    headers,
    tags: { name: 'farmer_list_state_paged' },
  });
  check(fRes, {
    'state farmer list is 200': (r) => r.status === 200,
    'state farmer list items present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        /* empty */
        return false;
      }
    },
  });

  // 2. Farmer List - State-scoped with search
  const fResSearch = http.get(`${BASE_URL}/slis/farmers?limit=50&search=Muhammad`, {
    headers,
    tags: { name: 'farmer_search' },
  });
  check(fResSearch, {
    'state farmer list search is 200': (r) => r.status === 200,
  });

  // 3. Plot List - State-scoped
  const pRes = http.get(`${BASE_URL}/slis/plots?limit=50&status=approved`, {
    headers,
    tags: { name: 'plot_list_state_paged' },
  });
  check(pRes, {
    'state plot list is 200': (r) => r.status === 200,
    'state plot list items present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        /* empty */
        return false;
      }
    },
  });

  // 4. Plot List - State-scoped with serviceType filter
  const pResFiltered = http.get(`${BASE_URL}/slis/plots?limit=50&serviceType=improved`, {
    headers,
    tags: { name: 'plot_filtered_service' },
  });
  check(pResFiltered, {
    'state plot list filtered is 200': (r) => r.status === 200,
  });

  sleep(0.5);
}

export function testSchemeLists(data) {
  const headers = {
    Authorization: `Bearer ${data.schemeToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Farmer List - Scheme-scoped (automatically restricted to user's assigned scheme)
  const fRes = http.get(`${BASE_URL}/slis/farmers?limit=50&status=approved`, {
    headers,
    tags: { name: 'farmer_list_scheme_paged' },
  });
  check(fRes, {
    'scheme farmer list is 200': (r) => r.status === 200,
    'scheme farmer list items present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        /* empty */
        return false;
      }
    },
  });

  // 2. Farmer List - Scheme-scoped with search
  const fResSearch = http.get(`${BASE_URL}/slis/farmers?limit=50&search=Aliyu`, {
    headers,
    tags: { name: 'farmer_search' },
  });
  check(fResSearch, {
    'scheme farmer list search is 200': (r) => r.status === 200,
  });

  // 3. Plot List - Scheme-scoped
  const pRes = http.get(`${BASE_URL}/slis/plots?limit=50&status=approved`, {
    headers,
    tags: { name: 'plot_list_scheme_paged' },
  });
  check(pRes, {
    'scheme plot list is 200': (r) => r.status === 200,
    'scheme plot list items present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        /* empty */
        return false;
      }
    },
  });

  // 4. Plot List - Scheme-scoped with serviceType filter
  const pResFiltered = http.get(`${BASE_URL}/slis/plots?limit=50&serviceType=new`, {
    headers,
    tags: { name: 'plot_filtered_service' },
  });
  check(pResFiltered, {
    'scheme plot list filtered is 200': (r) => r.status === 200,
  });

  sleep(0.5);
}
