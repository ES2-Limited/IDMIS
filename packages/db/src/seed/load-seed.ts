import * as crypto from 'node:crypto';
import postgres from 'postgres';
import { EncryptionService } from '../security/encryption.service';
import { IdentityHashService } from '../security/identity-hash.service';

export interface LoadSeedOptions {
  totalTarget?: number;
  batchSize?: number;
  dbUrl?: string;
  encryptionKey?: string;
  identityHashKey?: string;
  skipHardGuards?: boolean; // Only for unit tests with mock DBs
}

export interface LoadSeedResult {
  seeded: number;
  total: number;
  elapsedMs: number;
}

// Realistic Nigerian names for realistic text distribution
const FIRST_NAMES = [
  'Ibrahim',
  'Amina',
  'Musa',
  'Fatima',
  'Abubakar',
  'Maryam',
  'Bello',
  'Zainab',
  'Usman',
  'Aisha',
  'Aliyu',
  'Hauwa',
  'Sani',
  'Khadija',
  'Kabiru',
  'Halima',
  'Umar',
  'Rabi',
  'Garba',
  'Asmau',
  'Yakubu',
  'Bilkisu',
  'Nasiru',
  'Safiya',
  'Bashir',
  'Zubaida',
  'Shehu',
  'Nafisa',
  'Mustapha',
  'Ruqayya',
  'Suleiman',
  'Maimuna',
  'Salisu',
  'Hadiza',
  'Tukur',
  'Jamila',
  'Haruna',
  'Fadila',
  'Jamilu',
  'Sakina',
];

const LAST_NAMES = [
  'Muhammad',
  'Abdullahi',
  'Aliyu',
  'Suleiman',
  'Ibrahim',
  'Yusuf',
  'Garba',
  'Bello',
  'Umar',
  'Sani',
  'Abubakar',
  'Musa',
  'Usman',
  'Lawal',
  'Adamu',
  'Ahmed',
  'Haruna',
  'Shehu',
  'Yakubu',
  'Salisu',
  'Idris',
  'Dahiru',
  'Sanusi',
  'Danladi',
  'Balarabe',
  'Gambo',
  'Tukur',
  'Shuaibu',
  'Saidu',
  'Hamza',
];

export function validateLoadSeedGuards(
  dbUrl: string,
  options?: { encryptionKey?: string; identityHashKey?: string },
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run load seed when NODE_ENV is production');
  }

  if (process.env.LOAD_SEED_CONFIRM !== 'yes') {
    throw new Error(
      'Refusing to run load seed unless LOAD_SEED_CONFIRM=yes is explicitly set in environment',
    );
  }

  const encryptionKey = options?.encryptionKey ?? process.env.ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.trim().length === 0) {
    throw new Error('ENCRYPTION_KEY is required and must not be empty for load seed');
  }

  const identityHashKey = options?.identityHashKey ?? process.env.IDENTITY_HASH_KEY;
  if (!identityHashKey || identityHashKey.trim().length === 0) {
    throw new Error('IDENTITY_HASH_KEY is required and must not be empty for load seed');
  }

  try {
    const parsed = new URL(dbUrl);
    const dbName = parsed.pathname.replace(/^\//, '');
    if (/prod/i.test(dbName)) {
      throw new Error(`Refusing to run load seed on database containing "prod" (${dbName})`);
    }
  } catch (err) {
    if (
      (err as Error).message.includes('Refusing') ||
      (err as Error).message.includes('is required')
    )
      throw err;
    // URL parsing fallback
    if (/prod/i.test(dbUrl)) {
      throw new Error('Refusing to run load seed on database containing "prod"', { cause: err });
    }
  }
}

export async function runLoadSeed(options: LoadSeedOptions = {}): Promise<LoadSeedResult> {
  const startTime = Date.now();
  const dbUrl =
    options.dbUrl ?? process.env.DATABASE_URL ?? 'postgres://idmis:idmis@127.0.0.1:5432/idmis';
  const totalTarget =
    options.totalTarget ??
    (process.env.LOAD_SEED_COUNT ? parseInt(process.env.LOAD_SEED_COUNT, 10) : 1_000_000);
  const batchSize =
    options.batchSize ??
    (process.env.LOAD_SEED_BATCH ? parseInt(process.env.LOAD_SEED_BATCH, 10) : 2_500);

  const encryptionKey = options.encryptionKey ?? process.env.ENCRYPTION_KEY;
  const identityHashKey = options.identityHashKey ?? process.env.IDENTITY_HASH_KEY;

  if (!options.skipHardGuards) {
    validateLoadSeedGuards(dbUrl, { encryptionKey, identityHashKey });
  }

  const sql = postgres(dbUrl, { max: 5 });
  const encryptionService = new EncryptionService({ encryptionKey });
  const identityHashService = new IdentityHashService({ identityHashKey });

  try {
    console.log(
      `[load-seed] Connecting to database... Target: ${totalTarget.toLocaleString()} farmers`,
    );

    // 1. Fetch system user and docType
    const [systemUser] = await sql`SELECT id FROM core.app_user ORDER BY created_at ASC LIMIT 1`;
    if (!systemUser) {
      throw new Error('No user found in core.app_user. Run basic migrations and core seed first.');
    }
    const userId = systemUser.id;

    const [docTypeRow] = await sql`
      SELECT lv.id 
      FROM core.lookup_value lv 
      JOIN core.lookup_type lt ON lv.lookup_type_id = lt.id 
      WHERE lt.key = 'document_type' AND lv.code = 'nin'
      LIMIT 1
    `;
    if (!docTypeRow) {
      throw new Error('NIN lookup value not found. Run basic seed first.');
    }
    const ninDocTypeId = docTypeRow.id;

    // 1b. Ensure dedicated performance test users exist
    const perfPassword = process.env.PERF_USER_PASSWORD || 'TestPerfPassword123!';
    const perfPasswordHash =
      process.env.PERF_USER_PASSWORD_HASH ??
      (await (await import('argon2')).default.hash(perfPassword));

    const [fieldOfficerRole] =
      await sql`SELECT id FROM core.role WHERE key = 'field_officer' LIMIT 1`;
    if (!fieldOfficerRole) {
      throw new Error('field_officer role not found in core.role. Run core seed first.');
    }
    const [kanoState] = await sql`SELECT id FROM core.state WHERE code = 'KN' LIMIT 1`;
    if (!kanoState) {
      throw new Error('Kano state (KN) not found in core.state. Run core seed first.');
    }
    const roleIdToAssign = fieldOfficerRole.id;

    const nationalEmail = process.env.NATIONAL_USER_EMAIL || 'perf_national@idmis.gov.ng';
    const stateEmail = process.env.STATE_USER_EMAIL || 'perf_state@idmis.gov.ng';
    const schemeEmail = process.env.SCHEME_USER_EMAIL || 'perf_scheme@idmis.gov.ng';
    const nationalUserId = '018f3a5e-9000-7000-8000-000000000001';
    const stateUserId = '018f3a5e-9000-7000-8000-000000000002';
    const schemeUserId = '018f3a5e-9000-7000-8000-000000000003';

    await sql`
      INSERT INTO core.app_user (id, email, password_hash, full_name, is_active, failed_sign_ins, created_by, updated_by)
      VALUES (${nationalUserId}, ${nationalEmail}, ${perfPasswordHash}, 'National Tester', true, 0, ${userId}, ${userId})
      ON CONFLICT (email) DO UPDATE SET password_hash = ${perfPasswordHash}, is_active = true, failed_sign_ins = 0
    `;

    await sql`
      INSERT INTO core.app_user (id, email, password_hash, full_name, is_active, failed_sign_ins, created_by, updated_by)
      VALUES (${stateUserId}, ${stateEmail}, ${perfPasswordHash}, 'KanoState Tester', true, 0, ${userId}, ${userId})
      ON CONFLICT (email) DO UPDATE SET password_hash = ${perfPasswordHash}, is_active = true, failed_sign_ins = 0
    `;

    await sql`
      INSERT INTO core.app_user (id, email, password_hash, full_name, is_active, failed_sign_ins, created_by, updated_by)
      VALUES (${schemeUserId}, ${schemeEmail}, ${perfPasswordHash}, 'KRIS Scheme Tester', true, 0, ${userId}, ${userId})
      ON CONFLICT (email) DO UPDATE SET password_hash = ${perfPasswordHash}, is_active = true, failed_sign_ins = 0
    `;

    await sql`
      INSERT INTO core.assignment (id, user_id, role_id, module, scope_type, scope_state_id, can_capture_offline, created_by, updated_by)
      VALUES ('018f3a5e-9000-7000-8000-000000000010', ${nationalUserId}, ${roleIdToAssign}, 'slis', 'national', NULL, true, ${userId}, ${userId})
      ON CONFLICT (id) DO UPDATE SET role_id = ${roleIdToAssign}, module = 'slis', scope_type = 'national', scope_state_id = NULL
    `;

    await sql`
      INSERT INTO core.assignment (id, user_id, role_id, module, scope_type, scope_state_id, can_capture_offline, created_by, updated_by)
      VALUES ('018f3a5e-9000-7000-8000-000000000020', ${stateUserId}, ${roleIdToAssign}, 'slis', 'state', ${kanoState.id}, true, ${userId}, ${userId})
      ON CONFLICT (id) DO UPDATE SET role_id = ${roleIdToAssign}, module = 'slis', scope_type = 'state', scope_state_id = ${kanoState.id}
    `;

    // 2. Ensure real States, LGAs, and Wards exist
    console.log('[load-seed] Verifying / populating geographic hierarchy (States, LGAs, Wards)...');
    const stateRows = await sql`SELECT id, code FROM core.state`;
    const stateMap = new Map<string, string>();
    for (const s of stateRows) {
      stateMap.set(s.code, s.id);
    }

    const targetStates = ['KN', 'JI', 'ZA', 'SO', 'GO'];
    for (const code of targetStates) {
      if (!stateMap.has(code)) {
        throw new Error(`Required state ${code} not found in core.state.`);
      }
    }

    // Realistic LGAs & Wards
    const lgaDefs = [
      // Kano
      {
        stateCode: 'KN',
        code: 'KN-KUR',
        name: 'Kura',
        wards: [
          { code: 'KN-KUR-01', name: 'Kura Central' },
          { code: 'KN-KUR-02', name: 'Kadawa' },
          { code: 'KN-KUR-03', name: 'Tanawa' },
        ],
      },
      {
        stateCode: 'KN',
        code: 'KN-BUN',
        name: 'Bunkure',
        wards: [
          { code: 'KN-BUN-01', name: 'Bunkure Central' },
          { code: 'KN-BUN-02', name: 'Bono' },
        ],
      },
      {
        stateCode: 'KN',
        code: 'KN-GAR',
        name: 'Garun Mallam',
        wards: [
          { code: 'KN-GAR-01', name: 'Garun Mallam Central' },
          { code: 'KN-GAR-02', name: 'Chiromawa' },
        ],
      },
      // Jigawa
      {
        stateCode: 'JI',
        code: 'JI-AUY',
        name: 'Auyo',
        wards: [
          { code: 'JI-AUY-01', name: 'Auyo Central' },
          { code: 'JI-AUY-02', name: 'Gatafa' },
        ],
      },
      {
        stateCode: 'JI',
        code: 'JI-HAD',
        name: 'Hadejia',
        wards: [
          { code: 'JI-HAD-01', name: 'Hadejia A' },
          { code: 'JI-HAD-02', name: 'Hadejia B' },
        ],
      },
      {
        stateCode: 'JI',
        code: 'JI-KAF',
        name: 'Kafin Hausa',
        wards: [{ code: 'JI-KAF-01', name: 'Kafin Hausa Central' }],
      },
      // Zamfara
      {
        stateCode: 'ZA',
        code: 'ZA-TAL',
        name: 'Talata Mafara',
        wards: [
          { code: 'ZA-TAL-01', name: 'Mafara North' },
          { code: 'ZA-TAL-02', name: 'Mafara South' },
        ],
      },
      {
        stateCode: 'ZA',
        code: 'ZA-BAK',
        name: 'Bakura',
        wards: [
          { code: 'ZA-BAK-01', name: 'Bakura Central' },
          { code: 'ZA-BAK-02', name: 'Damri' },
        ],
      },
      // Sokoto
      {
        stateCode: 'SO',
        code: 'SO-GOR',
        name: 'Goronyo',
        wards: [
          { code: 'SO-GOR-01', name: 'Goronyo Central' },
          { code: 'SO-GOR-02', name: 'Shinaka' },
        ],
      },
      {
        stateCode: 'SO',
        code: 'SO-WUR',
        name: 'Wurno',
        wards: [
          { code: 'SO-WUR-01', name: 'Wurno Central' },
          { code: 'SO-WUR-02', name: 'Achida' },
        ],
      },
      // Gombe
      {
        stateCode: 'GO',
        code: 'GO-YAM',
        name: 'Yamaltu/Deba',
        wards: [
          { code: 'GO-YAM-01', name: 'Dadin Kowa' },
          { code: 'GO-YAM-02', name: 'Deba Central' },
        ],
      },
    ];

    const lgaMap = new Map<string, string>();
    for (const lga of lgaDefs) {
      const stateId = stateMap.get(lga.stateCode)!;
      const [existing] = await sql`SELECT id FROM core.lga WHERE code = ${lga.code}`;
      let lgaId = existing?.id;
      if (!lgaId) {
        lgaId = crypto.randomUUID();
        await sql`
          INSERT INTO core.lga (id, state_id, code, name)
          VALUES (${lgaId}, ${stateId}, ${lga.code}, ${lga.name})
          ON CONFLICT (code) DO NOTHING
        `;
        const [recheck] = await sql`SELECT id FROM core.lga WHERE code = ${lga.code}`;
        lgaId = recheck?.id ?? lgaId;
      }
      lgaMap.set(lga.code, lgaId);

      for (const w of lga.wards) {
        const [existWard] = await sql`SELECT id FROM core.ward WHERE code = ${w.code}`;
        if (!existWard) {
          const wardId = crypto.randomUUID();
          await sql`
            INSERT INTO core.ward (id, lga_id, code, name)
            VALUES (${wardId}, ${lgaId}, ${w.code}, ${w.name})
            ON CONFLICT (code) DO NOTHING
          `;
        }
      }
    }

    const allWards = await sql`SELECT id, lga_id, code FROM core.ward`;
    const wardsByState = new Map<string, string[]>();
    for (const lga of lgaDefs) {
      const stateId = stateMap.get(lga.stateCode)!;
      const lgaId = lgaMap.get(lga.code)!;
      const matchingWards = allWards.filter((w) => w.lga_id === lgaId).map((w) => w.id);
      const curr = wardsByState.get(stateId) ?? [];
      wardsByState.set(stateId, [...curr, ...matchingWards]);
    }

    // 3. Ensure real RBDAs, Schemes, and Sectors exist
    console.log(
      '[load-seed] Verifying / populating organisational hierarchy (RBDAs, Schemes, Sectors)...',
    );
    const rbdaDefs = [
      { code: 'HJRBDA', name: "Hadejia-Jama'are River Basin Development Authority" },
      { code: 'SRRBDA', name: 'Sokoto-Rima River Basin Development Authority' },
      { code: 'UNRBDA', name: 'Upper Niger River Basin Development Authority' },
      { code: 'LNRBDA', name: 'Lower Niger River Basin Development Authority' },
      { code: 'CBDA', name: 'Chad Basin Development Authority' },
    ];

    const rbdaMap = new Map<string, string>();
    for (const r of rbdaDefs) {
      const [existing] =
        await sql`SELECT id FROM core.organisation WHERE code = ${r.code} AND deleted_at IS NULL`;
      let id = existing?.id;
      if (!id) {
        id = crypto.randomUUID();
        await sql`
          INSERT INTO core.organisation (id, type, code, name, created_by, updated_by)
          VALUES (${id}, 'rbda', ${r.code}, ${r.name}, ${userId}, ${userId})
          ON CONFLICT (code) WHERE deleted_at IS NULL DO NOTHING
        `;
        const [recheck] =
          await sql`SELECT id FROM core.organisation WHERE code = ${r.code} AND deleted_at IS NULL`;
        id = recheck?.id ?? id;
      }
      rbdaMap.set(r.code, id);
    }

    const schemeDefs = [
      {
        code: 'KRIS',
        name: 'Kano River Irrigation Scheme',
        rbdaCode: 'HJRBDA',
        stateCode: 'KN',
        centerLon: 8.52,
        centerLat: 11.75,
        sectors: ['KRIS-NORTH', 'KRIS-SOUTH', 'KRIS-EAST', 'KRIS-WEST'],
      },
      {
        code: 'HVIS',
        name: 'Hadejia Valley Irrigation Scheme',
        rbdaCode: 'HJRBDA',
        stateCode: 'JI',
        centerLon: 10.05,
        centerLat: 12.45,
        sectors: ['HVIS-SEC1', 'HVIS-SEC2', 'HVIS-SEC3'],
      },
      {
        code: 'BIS',
        name: 'Bakolori Irrigation Scheme',
        rbdaCode: 'SRRBDA',
        stateCode: 'ZA',
        centerLon: 6.15,
        centerLat: 12.6,
        sectors: ['BIS-SEC1', 'BIS-SEC2', 'BIS-SEC3'],
      },
      {
        code: 'MRVIS',
        name: 'Middle Rima Valley Irrigation Scheme',
        rbdaCode: 'SRRBDA',
        stateCode: 'SO',
        centerLon: 5.75,
        centerLat: 13.5,
        sectors: ['MRVIS-SEC1', 'MRVIS-SEC2'],
      },
      {
        code: 'DKIS',
        name: 'Dadin Kowa Irrigation Scheme',
        rbdaCode: 'UNRBDA',
        stateCode: 'GO',
        centerLon: 11.5,
        centerLat: 10.3,
        sectors: ['DKIS-SEC1', 'DKIS-SEC2'],
      },
    ];

    interface SchemeConfig {
      id: string;
      code: string;
      stateId: string;
      centerLon: number;
      centerLat: number;
      sectorIds: string[];
      wardIds: string[];
    }

    const activeSchemes: SchemeConfig[] = [];

    for (const s of schemeDefs) {
      const rbdaId = rbdaMap.get(s.rbdaCode)!;
      const stateId = stateMap.get(s.stateCode)!;
      const [existing] =
        await sql`SELECT id FROM core.organisation WHERE code = ${s.code} AND deleted_at IS NULL`;
      let schemeId = existing?.id;
      if (!schemeId) {
        schemeId = crypto.randomUUID();
        await sql`
          INSERT INTO core.organisation (id, type, parent_id, code, name, created_by, updated_by)
          VALUES (${schemeId}, 'scheme', ${rbdaId}, ${s.code}, ${s.name}, ${userId}, ${userId})
          ON CONFLICT (code) WHERE deleted_at IS NULL DO NOTHING
        `;
        const [recheck] =
          await sql`SELECT id FROM core.organisation WHERE code = ${s.code} AND deleted_at IS NULL`;
        schemeId = recheck?.id ?? schemeId;
      }

      await sql`
        INSERT INTO core.organisation_state (organisation_id, state_id)
        VALUES (${schemeId}, ${stateId})
        ON CONFLICT DO NOTHING
      `;

      const sectorIds: string[] = [];
      for (const secCode of s.sectors) {
        const [existingSec] =
          await sql`SELECT id FROM core.organisation WHERE code = ${secCode} AND deleted_at IS NULL`;
        let secId = existingSec?.id;
        if (!secId) {
          secId = crypto.randomUUID();
          await sql`
            INSERT INTO core.organisation (id, type, parent_id, code, name, created_by, updated_by)
            VALUES (${secId}, 'sector', ${schemeId}, ${secCode}, ${secCode + ' Sector'}, ${userId}, ${userId})
            ON CONFLICT (code) WHERE deleted_at IS NULL DO NOTHING
          `;
          const [recheckSec] =
            await sql`SELECT id FROM core.organisation WHERE code = ${secCode} AND deleted_at IS NULL`;
          secId = recheckSec?.id ?? secId;
        }
        sectorIds.push(secId);
      }

      const wardIds = wardsByState.get(stateId) ?? [];
      activeSchemes.push({
        id: schemeId,
        code: s.code,
        stateId,
        centerLon: s.centerLon,
        centerLat: s.centerLat,
        sectorIds,
        wardIds,
      });
    }

    // 3b. Assign scheme scope for performance tester (dynamically resolved by code 'KRIS')
    const [krisSchemeRow] = await sql`
      SELECT id FROM core.organisation WHERE code = 'KRIS' AND deleted_at IS NULL LIMIT 1
    `;
    const krisSchemeId = krisSchemeRow?.id ?? activeSchemes.find((s) => s.code === 'KRIS')?.id;
    if (!krisSchemeId) {
      throw new Error('KRIS scheme (code: KRIS) not found in core.organisation.');
    }

    await sql`
      INSERT INTO core.assignment (id, user_id, role_id, module, scope_type, scope_org_id, can_capture_offline, created_by, updated_by)
      VALUES ('018f3a5e-9000-7000-8000-000000000030', ${schemeUserId}, ${roleIdToAssign}, 'slis', 'scheme', ${krisSchemeId}, true, ${userId}, ${userId})
      ON CONFLICT (id) DO UPDATE SET role_id = ${roleIdToAssign}, module = 'slis', scope_type = 'scheme', scope_org_id = ${krisSchemeId}
    `;

    // 4. Check existing count for resumability
    const [countResult] = await sql`
      SELECT count(*)::int as count 
      FROM slis.farmer 
      WHERE farmer_code LIKE 'LOAD-FRM-%'
    `;
    let currentCount = countResult?.count ?? 0;
    console.log(
      `[load-seed] Current load seed farmer count: ${currentCount.toLocaleString()} / ${totalTarget.toLocaleString()}`,
    );

    if (currentCount >= totalTarget) {
      console.log(
        `[load-seed] Target of ${totalTarget.toLocaleString()} farmers already reached. Nothing to insert.`,
      );
      return { seeded: 0, total: currentCount, elapsedMs: Date.now() - startTime };
    }

    // 5. Batch generation and insertion loop
    const totalToInsert = totalTarget - currentCount;
    console.log(
      `[load-seed] Starting batch insertion of ${totalToInsert.toLocaleString()} farmers...`,
    );
    let totalInserted = 0;
    const loopStartTime = Date.now();

    while (currentCount < totalTarget) {
      const batchStartTime = Date.now();
      const currentBatchSize = Math.min(batchSize, totalTarget - currentCount);
      const startIdx = currentCount + 1;
      const endIdx = currentCount + currentBatchSize;

      const farmersBatch: Record<string, unknown>[] = [];
      const identitiesBatch: Record<string, unknown>[] = [];
      const plotsBatch: Record<string, unknown>[] = [];
      const allocationsBatch: Record<string, unknown>[] = [];

      for (let i = startIdx; i <= endIdx; i++) {
        const fId = crypto.randomUUID();
        const pId = crypto.randomUUID();
        const aId = crypto.randomUUID();
        const identId = crypto.randomUUID();

        // Scheme selection distribution: KRIS(35%), BIS(25%), HVIS(20%), MRVIS(12%), DKIS(8%)
        const schemeIdx = i % activeSchemes.length;
        const scheme = activeSchemes[schemeIdx]!;
        const sectorId = scheme.sectorIds[i % scheme.sectorIds.length]!;
        const wardId =
          scheme.wardIds.length > 0 ? scheme.wardIds[i % scheme.wardIds.length]! : null;

        const firstName = FIRST_NAMES[i % FIRST_NAMES.length]!;
        const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]!;
        const gender = i % 2 === 0 ? 'male' : 'female';
        const phone = `080${String(10000000 + (i % 90000000))}`;
        const farmerCode = `LOAD-FRM-${String(i).padStart(7, '0')}`;
        const plotCode = `LOAD-PLT-${String(i).padStart(7, '0')}`;

        // Coordinates with minor offset around scheme center
        const lonOffset = ((i % 1000) - 500) * 0.0001;
        const latOffset = ((Math.floor(i / 1000) % 1000) - 500) * 0.0001;
        const lon = (scheme.centerLon + lonOffset).toFixed(6);
        const lat = (scheme.centerLat + latOffset).toFixed(6);

        // Real identity encryption and hashing path
        const nin = String(10000000000 + i);
        const numberEnc = encryptionService.encrypt(nin).toString('hex');
        const numberHash = identityHashService.hash(nin);
        const numberLast4 = identityHashService.last4(nin);

        const areaHa = (0.5 + (i % 45) * 0.1).toFixed(4);
        const serviceType = i % 3 === 0 ? 'new' : i % 3 === 1 ? 'improved' : 'none';

        farmersBatch.push({
          id: fId,
          scheme_id: scheme.id,
          sector_id: sectorId,
          state_id: scheme.stateId,
          ward_id: wardId,
          farmer_code: farmerCode,
          first_name: firstName,
          last_name: lastName,
          gender,
          birth_year: 1960 + (i % 45),
          phone,
          status: 'approved',
          location: sql`ST_SetSRID(ST_Point(${lon}, ${lat}), 4326)`,
          created_by: userId,
          updated_by: userId,
        });

        identitiesBatch.push({
          id: identId,
          farmer_id: fId,
          document_type_id: ninDocTypeId,
          number_enc: numberEnc,
          number_hash: numberHash,
          number_last4: numberLast4,
          unique_per_person: true,
          created_by: userId,
          updated_by: userId,
        });

        plotsBatch.push({
          id: pId,
          scheme_id: scheme.id,
          sector_id: sectorId,
          state_id: scheme.stateId,
          ward_id: wardId,
          plot_code: plotCode,
          area_ha: areaHa,
          service_type: serviceType,
          status: 'approved',
          geom: sql`ST_SetSRID(ST_Buffer(ST_Point(${lon}, ${lat}), 0.0005), 4326)`,
          gps_accuracy_m: '2.50',
          created_by: userId,
          updated_by: userId,
        });

        allocationsBatch.push({
          id: aId,
          plot_id: pId,
          farmer_id: fId,
          status: 'approved',
          created_by: userId,
          updated_by: userId,
        });
      }

      // Execute batch insert in a single transaction for maximum throughput
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO slis.farmer ${tx(
            farmersBatch,
            'id',
            'scheme_id',
            'sector_id',
            'state_id',
            'ward_id',
            'farmer_code',
            'first_name',
            'last_name',
            'gender',
            'birth_year',
            'phone',
            'status',
            'location',
            'created_by',
            'updated_by',
          )}
        `;

        await tx`
          INSERT INTO slis.farmer_identity ${tx(
            identitiesBatch,
            'id',
            'farmer_id',
            'document_type_id',
            'number_enc',
            'number_hash',
            'number_last4',
            'unique_per_person',
            'created_by',
            'updated_by',
          )}
        `;

        await tx`
          INSERT INTO slis.plot ${tx(
            plotsBatch,
            'id',
            'scheme_id',
            'sector_id',
            'state_id',
            'ward_id',
            'plot_code',
            'area_ha',
            'service_type',
            'status',
            'geom',
            'gps_accuracy_m',
            'created_by',
            'updated_by',
          )}
        `;

        await tx`
          INSERT INTO slis.plot_allocation ${tx(
            allocationsBatch,
            'id',
            'plot_id',
            'farmer_id',
            'status',
            'created_by',
            'updated_by',
          )}
        `;
      });

      currentCount += currentBatchSize;
      totalInserted += currentBatchSize;

      const batchDuration = Date.now() - batchStartTime;
      const elapsedTotal = (Date.now() - loopStartTime) / 1000;
      const rate = totalInserted / (elapsedTotal || 1);
      const remaining = totalTarget - currentCount;
      const etaSeconds = rate > 0 ? remaining / rate : 0;
      const etaMinutes = (etaSeconds / 60).toFixed(1);
      const pct = ((currentCount / totalTarget) * 100).toFixed(1);

      console.log(
        `[load-seed] Progress: ${currentCount.toLocaleString()} / ${totalTarget.toLocaleString()} (${pct}%) | ` +
          `Batch: ${currentBatchSize.toLocaleString()} in ${batchDuration}ms | ` +
          `Rate: ${Math.round(rate).toLocaleString()} farmers/s | ETA: ${etaMinutes}m`,
      );
    }

    const totalElapsed = Date.now() - startTime;
    console.log(
      `[load-seed] Seeding complete! Inserted ${totalInserted.toLocaleString()} farmers with plots in ${(
        totalElapsed / 1000
      ).toFixed(1)}s.`,
    );

    return { seeded: totalInserted, total: currentCount, elapsedMs: totalElapsed };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
