/* global __VU, __ITER */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, NATIONAL_USER, PROVISIONAL_THRESHOLDS, authenticate } from './config.js';

export const options = {
  scenarios: {
    sync_scenario: {
      executor: 'constant-vus',
      vus: 2,
      duration: '30s',
    },
  },
  thresholds: {
    ...PROVISIONAL_THRESHOLDS.sync,
    'checks{check:every op is applied}': ['rate==1.0'],
  },
};

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function setup() {
  const token = authenticate(BASE_URL, NATIONAL_USER);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Register distinct devices for each concurrent VU
  const deviceIds = [];
  for (let i = 1; i <= 2; i++) {
    const installId = uuidv4();
    const regPayload = JSON.stringify({
      installationId: installId,
      platform: 'android',
      label: `K6 Perf Test Device VU ${i}`,
    });

    const regRes = http.post(`${BASE_URL}/slis/sync/device/register`, regPayload, { headers });
    check(regRes, {
      'device registered': (r) => r.status === 200 || r.status === 201,
    });

    try {
      const regData = JSON.parse(regRes.body);
      if (regData && regData.id) {
        deviceIds.push(regData.id);
      }
    } catch {
      /* empty */
    }
  }

  // Fetch schemes to associate test records
  const schemesRes = http.get(`${BASE_URL}/admin/organisations?type=scheme&limit=5`, { headers });
  let schemeId = null;
  try {
    const schemes = JSON.parse(schemesRes.body);
    const items = schemes.items || schemes;
    if (items && items.length > 0) {
      schemeId = items[0].id;
    }
  } catch {
    /* empty */
  }

  // Fetch an existing farmer belonging to the scheme for valid individual water requests
  let farmerId = null;
  if (schemeId) {
    const farmersRes = http.get(`${BASE_URL}/slis/farmers?limit=5&schemeId=${schemeId}`, {
      headers,
    });
    try {
      const farmers = JSON.parse(farmersRes.body);
      const items = farmers.items || farmers;
      if (items && items.length > 0) {
        farmerId = items[0].id;
      }
    } catch {
      /* empty */
    }
  }

  return { token, deviceIds, schemeId, farmerId };
}

export default function (data) {
  const deviceId =
    data.deviceIds && data.deviceIds.length > 0
      ? data.deviceIds[(__VU - 1) % data.deviceIds.length]
      : '00000000-0000-0000-0000-000000000000';

  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
  };

  // --- 1. Sync Pull (500 changes) ---
  const pullRes = http.get(`${BASE_URL}/slis/sync/pull?limit=500`, {
    headers,
    tags: { endpoint: 'sync_pull' },
  });

  check(pullRes, {
    'sync pull returned 200': (r) => r.status === 200,
    'sync pull items array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.items);
      } catch {
        return false;
      }
    },
  });

  // --- 2. Sync Push (batch of 200 changes) ---
  // Ensure each VU operates on isolated unique records and codes
  const ops = [];
  const baseBatchCode = `SYNC-VU${__VU}-${__ITER}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;

  for (let i = 0; i < 200; i++) {
    const recordId = uuidv4();
    const opId = uuidv4();
    ops.push({
      opId,
      entity: 'water_request',
      action: 'create',
      recordId,
      baseVersion: 1,
      data: {
        schemeId: data.schemeId || '018f3a5e-0001-7000-8000-000000000001',
        requestCode: `${baseBatchCode}-${i}`,
        level: 'individual',
        farmerId: data.farmerId,
        volumeM3: '150.00',
        periodFromOn: new Date().toISOString().split('T')[0],
        periodToOn: new Date().toISOString().split('T')[0],
        status: 'submitted',
      },
    });
  }

  const pushPayload = JSON.stringify({
    deviceId,
    ops,
  });

  const pushRes = http.post(`${BASE_URL}/slis/sync/push`, pushPayload, {
    headers,
    tags: { endpoint: 'sync_push' },
  });

  check(pushRes, {
    'sync push returned 200': (r) => r.status === 200 || r.status === 201,
    'sync push has results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.results);
      } catch {
        return false;
      }
    },
    'every op is applied': (r) => {
      try {
        const body = JSON.parse(r.body);
        if (!Array.isArray(body.results) || body.results.length === 0) return false;
        return body.results.every((op) => op.outcome === 'applied' || op.outcome === 'duplicate');
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
