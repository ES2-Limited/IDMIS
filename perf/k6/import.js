/* global __ENV, console */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, NATIONAL_USER, PROVISIONAL_THRESHOLDS, authenticate } from './config.js';

export const options = {
  scenarios: {
    import_scenario: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10m',
    },
  },
  thresholds: PROVISIONAL_THRESHOLDS.import,
};

function generateFarmerCsv(rowCount) {
  const headers = [
    'farmerCode',
    'firstName',
    'lastName',
    'gender',
    'phone',
    'identityNumber',
    'schemeCode',
    'sectorCode',
  ].join(',');

  const lines = [headers];
  const timestamp = Date.now();

  for (let i = 1; i <= rowCount; i++) {
    const code = `IMP-FRM-${timestamp}-${i}`;
    const nin = String(30000000000 + (i % 9000000000));
    lines.push(
      [
        code,
        `ImportFirst${i}`,
        `ImportLast${i}`,
        i % 2 === 0 ? 'female' : 'male',
        `080${String(20000000 + (i % 80000000))}`,
        nin,
        'KRIS',
        'KRIS-NORTH',
      ].join(','),
    );
  }

  return lines.join('\n');
}

export function setup() {
  const token = authenticate(BASE_URL, NATIONAL_USER);
  return { token };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  const rowCount = __ENV.IMPORT_ROW_COUNT ? parseInt(__ENV.IMPORT_ROW_COUNT, 10) : 1000;
  console.log(`[k6-import] Generating CSV dataset with ${rowCount} rows...`);
  const csvContent = generateFarmerCsv(rowCount);
  const sizeBytes = csvContent.length;

  // 1. Initiate file upload
  const initUploadRes = http.post(
    `${BASE_URL}/files/upload/initiate`,
    JSON.stringify({
      fileName: `perf-import-${Date.now()}.csv`,
      mimeType: 'text/csv',
      sizeBytes,
    }),
    { headers },
  );

  check(initUploadRes, {
    'file upload initiate returned 200/201': (r) => r.status === 200 || r.status === 201,
  });

  const uploadInfo = JSON.parse(initUploadRes.body);
  const fileId = uploadInfo.fileId;
  const uploadUrl = uploadInfo.uploadUrl;

  // 2. Upload the file payload
  if (uploadUrl) {
    const uploadRes = http.put(uploadUrl, csvContent, {
      headers: { 'Content-Type': 'text/csv' },
    });
    check(uploadRes, {
      'file content uploaded': (r) => r.status === 200 || r.status === 204,
    });
  }

  // 3. Complete file upload
  const completeRes = http.post(`${BASE_URL}/files/upload/complete`, JSON.stringify({ fileId }), {
    headers,
  });
  check(completeRes, {
    'file upload complete returned 200/201': (r) => r.status === 200 || r.status === 201,
  });

  // 4. Initiate import batch
  const initImportRes = http.post(
    `${BASE_URL}/imports`,
    JSON.stringify({
      dataset: 'slis.farmer',
      fileId,
    }),
    { headers },
  );

  check(initImportRes, {
    'import initiated returned 200/201': (r) => r.status === 200 || r.status === 201,
  });

  const batch = JSON.parse(initImportRes.body);
  const batchId = batch.id;
  console.log(`[k6-import] Batch initiated: ${batchId}. Waiting for validation...`);

  // 5. Poll for validation completion
  let validated = false;
  let attempts = 0;
  while (!validated && attempts < 60) {
    sleep(2);
    attempts++;
    const checkRes = http.get(`${BASE_URL}/imports/${batchId}`, { headers });
    if (checkRes.status === 200) {
      const b = JSON.parse(checkRes.body);
      if (b.status === 'validated') {
        validated = true;
        console.log(`[k6-import] Batch ${batchId} validated successfully.`);
      } else if (b.status === 'failed' || b.status === 'validation_failed') {
        throw new Error(`Batch validation failed: ${JSON.stringify(b)}`);
      }
    }
  }

  // 6. Commit import batch
  const commitStartTime = Date.now();
  const commitRes = http.post(`${BASE_URL}/imports/${batchId}/commit`, JSON.stringify({}), {
    headers,
    tags: { endpoint: 'import_commit' },
  });

  check(commitRes, {
    'import commit accepted/returned 200': (r) => r.status === 200 || r.status === 202,
  });

  // 7. Poll for commit completion
  let committed = false;
  attempts = 0;
  while (!committed && attempts < 120) {
    sleep(2);
    attempts++;
    const checkRes = http.get(`${BASE_URL}/imports/${batchId}`, { headers });
    if (checkRes.status === 200) {
      const b = JSON.parse(checkRes.body);
      if (b.status === 'committed') {
        committed = true;
        const commitDuration = (Date.now() - commitStartTime) / 1000;
        console.log(`[k6-import] Batch ${batchId} committed in ${commitDuration.toFixed(1)}s.`);
      } else if (b.status === 'failed' || b.status === 'commit_failed') {
        throw new Error(`Batch commit failed: ${JSON.stringify(b)}`);
      }
    }
  }

  check(null, {
    'batch fully committed': () => committed,
  });
}
