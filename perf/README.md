# IDMIS 2.0 Performance Testing & Tuning (BE-5.3)

This directory contains load testing scripts, configuration, and performance benchmarks for TRIMING IDMIS 2.0 with a dataset of **1,000,000 farmers and plots**.

---

## 1. Provisional Thresholds

> **Note:** The TRD targets for offline sync and data import are pending final client confirmation. The thresholds below are marked **provisional — pending client confirmation** and are defined in `perf/k6/config.js`.

| Category           | Endpoint / Operation                  | Target Threshold | Status                                        |
| :----------------- | :------------------------------------ | :--------------- | :-------------------------------------------- |
| **List Endpoints** | Farmer list (paged, filtered, scoped) | p95 < 500 ms     | Agreed Target                                 |
| **List Endpoints** | Plot list (paged, filtered, scoped)   | p95 < 500 ms     | Agreed Target                                 |
| **Sync**           | Sync Push (batch of 200 changes)      | p95 < 2.0 s      | **Provisional — pending client confirmation** |
| **Sync**           | Sync Pull (500 changes)               | p95 < 1.5 s      | **Provisional — pending client confirmation** |
| **Import**         | 100,000 rows validated and committed  | < 10 minutes     | **Provisional — pending client confirmation** |

---

## 2. Seeding 1,000,000 Farmers and Plots

The load seed script creates 1,000,000 farmers, plots, plot allocations, and encrypted identities across real Nigerian States (Kano, Jigawa, Zamfara, Sokoto, Gombe), LGAs, Wards, RBDAs (HJRBDA, SRRBDA, UNRBDA), Schemes (KRIS, HVIS, BIS, MRVIS, DKIS), and Sectors.

### Hard Guards

The script enforces four strict guards before running:

1. `NODE_ENV` must **not** be `production`.
2. `LOAD_SEED_CONFIRM=yes` must be set.
3. `IDENTITY_HASH_KEY` and `ENCRYPTION_KEY` must be set and non-empty.
4. The target database name must **not** contain `prod` (case-insensitive).

### Running the Seed

```bash
# Seed 1,000,000 farmers with plots (batched, resumable, progress output)
LOAD_SEED_CONFIRM=yes pnpm db:seed:load

# Optional overrides:
# LOAD_SEED_COUNT=100000 LOAD_SEED_BATCH=2500 LOAD_SEED_CONFIRM=yes pnpm db:seed:load
```

---

## 3. Running k6 Load Tests

Tests can be executed directly using the `grafana/k6` Docker image or a local `k6` binary.

### Prerequisites

1. Ensure development services are running: `pnpm services:up`
2. Ensure the API is running with adequate connection pool headroom: `DB_POOL_MAX=30 pnpm dev` (or `DB_POOL_MAX=30 pnpm --filter @idmis/api start`)

### Environment Variables

All scripts read configuration strictly from environment variables:

- `BASE_URL`: Base API URL (e.g. `http://localhost:3000`)
- `APP_URL`: App frontend origin for CORS (e.g. `http://localhost:5173`)
- `NATIONAL_USER_EMAIL`: National user email (`perf_national@idmis.gov.ng`)
- `NATIONAL_USER_PASSWORD`: National user password
- `STATE_USER_EMAIL`: State-scoped user email (`perf_state@idmis.gov.ng`)
- `STATE_USER_PASSWORD`: State-scoped user password
- `SCHEME_USER_EMAIL`: Scheme-scoped user email (`perf_scheme@idmis.gov.ng`)
- `SCHEME_USER_PASSWORD`: Scheme-scoped user password

Pass these via `-e` flags to the k6 Docker container.

### A. List Endpoints (Farmers & Plots)

Runs paged, filtered, and searched queries across national, state, and scheme scopes:

```bash
docker run --rm -i --network host -v "$PWD/perf":/perf \
  -e BASE_URL=http://localhost:3000 \
  -e NATIONAL_USER_EMAIL=perf_national@idmis.gov.ng \
  -e NATIONAL_USER_PASSWORD=TestPerfPassword123! \
  -e STATE_USER_EMAIL=perf_state@idmis.gov.ng \
  -e STATE_USER_PASSWORD=TestPerfPassword123! \
  -e SCHEME_USER_EMAIL=perf_scheme@idmis.gov.ng \
  -e SCHEME_USER_PASSWORD=TestPerfPassword123! \
  grafana/k6 run /perf/k6/lists.js
```

### B. Offline Sync (Push & Pull)

Tests sync push with batches of 200 operations and sync pull with 500 changes:

```bash
docker run --rm -i --network host -v "$PWD/perf":/perf \
  -e BASE_URL=http://localhost:3000 \
  -e NATIONAL_USER_EMAIL=perf_national@idmis.gov.ng \
  -e NATIONAL_USER_PASSWORD=TestPerfPassword123! \
  grafana/k6 run /perf/k6/sync.js
```

### C. Data Import (Large CSV Validation & Commit)

Tests initiating, validating, and committing a large CSV import batch:

```bash
docker run --rm -i --network host -v "$PWD/perf":/perf -e IMPORT_ROW_COUNT=1000 grafana/k6 run /perf/k6/import.js
```

---

## 4. Benchmark Results (Before & After Tuning)

> **Important Note on Local Environment:** These benchmarks were measured with k6, the NestJS Fastify API, PostgreSQL, and Redis all executing concurrently on a single development laptop. The definitive gate is the staging run in an isolated environment.

The table below summarizes p95 latencies before and after adding query and index optimizations on a dataset of **1,000,000 farmers and plots**.

Both baseline and tuned benchmarks were executed under the exact same load: **20 concurrent VUs for 60 seconds** for all list endpoints, and **2 concurrent VUs for 30 seconds** for sync endpoints. A result is marked **PASS** strictly if the measured p95 number meets the target threshold; otherwise it is marked **FAIL**.

| Operation / Scenario                        | Baseline p95 (Before Tuning) | Tuned p95 (After Tuning) | Target Threshold    | Source   | VUs    | Duration | Result                                  |
| :------------------------------------------ | :--------------------------- | :----------------------- | :------------------ | :------- | :----- | :------- | :-------------------------------------- |
| **Farmer List (National, paged)**           | 241.1 ms                     | **123.4 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer List (State-scoped, paged)**       | 197.0 ms                     | **129.0 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer List (Scheme-scoped, paged)**      | 200.1 ms                     | **143.7 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer Search (Common name substring)**   | 269.8 ms                     | **173.1 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer Search (Rare code / 1 match)**     | 2,504.8 ms _(seq scan)_      | **262.4 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 30 s     | **PASS (9.5x speedup)**                 |
| **Plot List (National, paged)**             | 111.5 ms                     | **108.6 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot List (State-scoped, paged)**         | 143.4 ms                     | **131.8 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot List (Scheme-scoped, paged)**        | 135.2 ms                     | **109.1 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot Filtered (State + Service Type)**    | 156.0 ms                     | **108.7 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot Search (`ILIKE` substring)**         | 6,520.0 ms                   | **101.8 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS (64x speedup)**                  |
| **Sync Pull (batch of 500 changes)**        | 1.94 s                       | **133.7 ms**             | < 1.5 s _(prov.)_   | k6 p(95) | 2 VUs  | 30 s     | **PASS**                                |
| **Sync Push (200 ops, compute worker off)** | 13.40 s _(invalid payload)_  | **4.42 s**               | < 2.0 s _(prov.)_   | k6 p(95) | 2 VUs  | 30 s     | **FAIL (4.42 s > 2.0 s)**               |
| **Sync Push (200 ops, compute worker on)**  | 13.40 s _(invalid payload)_  | **1.28 s**               | < 2.0 s _(prov.)_   | k6 p(95) | 2 VUs  | 30 s     | **PASS**                                |
| **Import Validate & Commit (100k rows)**    | Pending Staging S3           | Pending Staging S3       | < 10 mins _(prov.)_ | N/A      | N/A    | N/A      | **NOT MEASURED — to be run on staging** |

---

## 5. Request Lifecycle Timing Breakdown & Pool Sizing

### 5.1 Single Request Timing Breakdown (Against 1M Dataset)

Timing profile measured sequentially for individual requests against the local 1M dataset:

- **Session Verification (`core.session`)**: 0.43 ms
- **User Verification (`core.app_user`)**: 0.19 ms
- **Abilities & Scope Resolution (Redis cache hit)**: 0.27 ms (cache miss compute: ~2.1 ms)
- **Main Query (`listFarmers` 50 rows paged with cursor)**: 3.51 ms
- **Main Query (`listFarmers` search `ILIKE '%Amina%'` with GIN)**: 9.3 ms (without GIN: 2,239 ms; plot search without GIN: 6,520 ms)
- **`COUNT(*)` over full table**: 0.00 ms (IDMIS list endpoints do NOT execute `COUNT(*)`; they use keyset cursor pagination `limit + 1`, avoiding the ~317 ms full-table count penalty)
- **Decryption / Masking per row**: 0.00 ms (farmer listings do not fetch or decrypt identity documents; AES-256-GCM / HMAC identity rows reside in `farmer_identity` and are only retrieved on single-record `GET /farmers/:id` with permission `slis.identity.view`)
- **JSON Serialization**: 0.39 ms (50 row objects)
- **Total Single-Request Sequential Latency**: ~4.79 ms for paged list, ~10.58 ms for search

### 5.2 Bottleneck Analysis & Pool Sizing

- **DB Pool Size (`DB_POOL_MAX`)**: Baseline defaulted to `max: 10` (the `postgres.js` default). With 20 concurrent VUs making 3 DB queries per request (session, user, domain query), requests experienced connection checkout queue delays.
  - Sizing Rule: `packages/db/src/index.ts` defaults `max: Number(process.env.DB_POOL_MAX || 20)`. The total sum of `DB_POOL_MAX` across all `api` and `worker` instances and replicas must strictly remain below PostgreSQL's configured `max_connections` (e.g. 100 in default Docker / dev configurations).
  - For dedicated local 20-VU k6 load testing, running the API with `DB_POOL_MAX=30` (`DB_POOL_MAX=30 pnpm dev`) provides dedicated connection headroom for concurrent VU throughput, bringing paged list p95 latencies down to 101–143 ms.
- **Process Count**: 1 single Node.js process (running NestJS with Fastify).

---

## 6. Index Optimizations (`0023_slis_perf_indexes.sql`)

Following query profiling, index pruning, and scheme support, migration `0023_slis_perf_indexes.sql` establishes:

1. **`slis.farmer_scheme_status_id_idx`** `btree (scheme_id, status, id)`: Serves scheme-scoped cursor pagination.
2. **`slis.farmer_state_status_id_idx`** `btree (state_id, status, id)`: Serves state-scoped cursor pagination.
3. **`slis.farmer_search_trgm_idx`** `gin (farmer_code gin_trgm_ops, first_name gin_trgm_ops, last_name gin_trgm_ops, phone gin_trgm_ops)`: Accelerates `ILIKE` substring search across farmer code, names, and phone numbers.
4. **`slis.plot_scheme_status_id_idx`** `btree (scheme_id, status, id)`: Serves scheme-scoped plot listings with cursor pagination.
5. **`slis.plot_state_status_id_idx`** `btree (state_id, status, id)`: Serves state-scoped plot listings with cursor pagination.
6. **`slis.plot_state_service_type_id_idx`** `btree (state_id, service_type, id)`: Serves state-scoped plot listings filtered by service type (`WHERE state_id = ... AND service_type = ... AND id > ... ORDER BY id`).
7. **`slis.plot_code_trgm_idx`** `gin (plot_code gin_trgm_ops)`: Accelerates plot code substring searches (cutting p95 from 6,520 ms to 101.8 ms).
8. **Dropped Overlapping Indexes**: Dropped redundant single-column indexes `slis.farmer_state_id_idx` and `slis.plot_state_id_idx`, as they are completely subsumed by the leading column of the composite `(state_id, status, id)` indexes.

### 6.1 Index Scan Statistics (`pg_stat_user_indexes`)

After executing the k6 load test suite (lists, rare-term search, and sync), `pg_stat_user_indexes` reports the following scans:

- **Active Tuned Indexes Used**:
  - `farmer_search_trgm_idx`: **25,585 scans** (utilized during rare-term and targeted text searches; for extremely common names with high match density, PostgreSQL's planner optimizes `ORDER BY id LIMIT 51` by walking `farmer_pkey` and terminating early after finding 51 rows, while rare code/name lookups invoke Bitmap Index Scans on `farmer_search_trgm_idx` cutting execution time from 2,504 ms to 25.9 ms)
  - `plot_code_trgm_idx`: 532 scans
  - `plot_state_service_type_id_idx`: 874 scans
  - `plot_state_status_id_idx`: 576 scans
  - `plot_scheme_status_id_idx`: 520 scans
  - `farmer_state_status_id_idx`: 804 scans
  - `farmer_scheme_status_id_idx`: 520 scans
- **Indexes with `idx_scan = 0`**:
  - `slis.farmer`: `farmer_phone_idx`, `farmer_scheme_code_unique`, `farmer_ward_id_idx`
  - `slis.plot`: `plot_scheme_code_unique`, `plot_ward_id_idx`
    _(Note: Retained in schema; `unique` constraints enforce data integrity, and foreign keys prevent table locks during cascade operations)._

---

## 7. Sync Push Write Latency Analysis

### 7.1 Transaction Batching & Savepoints

Previously, `sync.service.ts` looped through each operation in `input.ops` and opened a separate top-level database transaction. For a batch of 200 operations, this executed 200 individual transactions, resulting in 200 separate commits and WAL flushes to disk. Under 2 concurrent VUs pushing 200 ops for 30s, baseline p95 was **13.40 s**.

`sync.service.ts` has been refactored to wrap the batch inside a single outer `runInTransaction`, with nested savepoints per operation (`txStorage`). If an individual operation encounters a domain conflict or validation error, only that operation's savepoint is rolled back, allowing subsequent operations to proceed while collapsing the batch down to 1 final commit and WAL sync.

### 7.2 Invalidity of Previous Sync Push Numbers & Retest Results

> **Important Note:** All initial sync push benchmark numbers (~12.80 s – 13.40 s) were **INVALID** because the k6 push payload omitted the required `level` attribute on `slis.water_request` (`water_request.level` is `NOT NULL`). Consequently, every operation in the batch failed validation at the database level with a NOT NULL constraint violation, forcing savepoint rollbacks and error writes to `core.sync_op`.

`perf/k6/sync.js` has been updated to send valid payloads with `level: 'individual'` and a valid `farmerId` retrieved dynamically from the active scheme. In addition, an assertion was added to verify that 100% of operations in the push response return `outcome: 'applied'` (or `'duplicate'`), causing the load test to fail if any operation is rejected.

Re-running the sync test under the standard load (2 VUs, 30 s) with 100% applied ops yielded:

1. **With M&E Compute Worker Running**:
   - `sync_push` p95: **1.28 s** (< 2.0 s provisional target — **PASS**).
   - `sync_pull` p95: **133.7 ms** (< 1.5 s provisional target — **PASS**).
   - All 30 complete iterations (6,000 operations) succeeded with 100% `applied`.
2. **With M&E Compute Worker Stopped** (BullMQ queue paused & drained):
   - `sync_push` p95: **4.42 s** (< 2.0 s provisional target — **FAIL**).
   - `sync_pull` p95: **325.6 ms** (< 1.5 s provisional target — **PASS**).
   - Under 2 VUs writing 200 ops concurrently on local disk, write contention across competing transactions keeps p95 at 4.42 s.
   - Strictly recorded as **FAIL (4.42 s > 2.0 s)** for the conservative local baseline. Staging multi-disk IOPS separation will establish definitive production metrics.

### 7.3 Known issue: sync push (Profiling & Slow Query Analysis)

Profiling via `pg_stat_statements` during the 2 VU / 30 s sync test revealed the root causes behind sync latency spikes:

#### 1. Database Sizing: `core.change_log`

- **Row count**: **3,000,000 rows**
- **Existing indexes**:
  - `change_log_pkey` PRIMARY KEY, btree (`seq`)
  - `change_log_entity_record_idx` btree (`entity`, `record_id`)
  - `change_log_scheme_xid_seq_idx` btree (`scheme_id`, `xid`, `seq`)
  - `change_log_state_xid_seq_idx` btree (`state_id`, `xid`, `seq`)
  - `change_log_xid_seq_idx` btree (`xid`, `seq`)
- **Change Log Read Performance**: Sync pull cursor query (`SELECT xid, seq, entity, record_id, op FROM core.change_log WHERE xid < pg_snapshot_xmin(...) ORDER BY xid, seq LIMIT 500`) executes in **2.89 ms mean time** via `change_log_xid_seq_idx`.

#### 2. Top 10 Queries by Total Execution Time (`pg_stat_statements`)

| Total Time (ms) | Calls | Mean Time (ms) | Query Preview                                                                                            |
| :-------------- | :---- | :------------- | :------------------------------------------------------------------------------------------------------- |
| **83,864.41**   | 1,333 | 62.91          | `select COALESCE(round(sum(case when "service_type" = $4 then "area_ha" ...` (`slis.plot` by state)      |
| **80,013.69**   | 154   | **519.57**     | `select COALESCE(round(sum(case when "service_type" = $4 then "area_ha" ...` (`slis.plot` by scheme)     |
| **21,620.21**   | 110   | 196.55         | `select count(distinct "id")::int, count(distinct case when "gender" = $4 ...` (`slis.farmer` by scheme) |
| **19,792.61**   | 946   | 20.92          | `select count(distinct "id")::int, count(distinct case when "gender" = $4 ...` (`slis.farmer` by state)  |
| **14,831.87**   | 31    | 478.45         | `select COALESCE(round(sum(case when "service_type" = $3 then "area_ha" ...` (`slis.plot` national)      |
| **6,495.14**    | 22    | 295.23         | `select count(distinct "id")::int ...` (`slis.farmer` national)                                          |
| **2,528.78**    | 1     | 2,528.78       | `SELECT count(*) FROM core.change_log`                                                                   |
| **1,065.54**    | 22    | 48.43          | `select "id", "version", ... from "slis"."farmer" where "id" in ($1..$500)` (pull hydration)             |
| **876.98**      | 7,582 | 0.12           | `update "me"."indicator_value" set "version" = ... where "id" = ...`                                     |
| **737.58**      | 4,400 | 0.17           | `update "core"."sync_op" set "outcome" = $1, "errors" = $2 where "op_id" = $3`                           |

#### 3. Root Cause Analysis

1. **Background M&E Compute Resource Contention**:
   Pushed records generate outbox events that trigger BullMQ debounce jobs (`debounce-scheme-*`, `debounce-global`) in `MeComputeService`. `MeComputeService` executes heavy unindexed aggregation queries over 1,000,000 plots and 1,000,000 farmers. In aggregate, these analytical queries consumed **over 226 seconds of database execution time** across ~2,500 executions during the load run, severely contending for CPU and buffer cache against concurrent sync write transactions.
2. **Missing `level` Field in Test Payload**:
   The test data in `perf/k6/sync.js` omitted the required `level` column (`slis.water_request.level` is NOT NULL). Every individual operation failed with a database constraint error, forcing savepoint rollbacks and error logging into `core.sync_op`.

#### 4. Slowest Query `EXPLAIN (ANALYZE, BUFFERS)`

The slowest query by mean latency is the scheme-level plot area aggregation in `MeComputeService` (519.57 ms mean, up to 1,263 ms under load):

```sql
EXPLAIN (ANALYZE, BUFFERS)
select COALESCE(round(sum(case when "service_type" = 'gravity' then "area_ha" else 0 end)::numeric, 2), 0)::text,
       COALESCE(round(sum(case when "service_type" = 'pumping' then "area_ha" else 0 end)::numeric, 2), 0)::text,
       COALESCE(round(sum(case when "service_type" in ('gravity', 'pumping') then "area_ha" else 0 end)::numeric, 2), 0)::text
from "slis"."plot"
where ("slis"."plot"."status" = 'approved' and "slis"."plot"."deleted_at" is null and "slis"."plot"."approved_at" <= now() and "slis"."plot"."scheme_id" = 'd12bb308-222b-4772-80d7-fda44d671aa5');
```

```text
Aggregate  (cost=109335.35..109335.38 rows=1 width=96) (actual time=938.995..958.859 rows=1 loops=1)
  Buffers: shared hit=3168 read=96834
  ->  Gather  (cost=1000.00..109335.33 rows=1 width=11) (actual time=936.725..956.555 rows=0 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=3168 read=96834
        ->  Parallel Seq Scan on plot  (cost=0.00..108335.23 rows=1 width=11) (actual time=666.267..666.269 rows=0 loops=3)
              Filter: ((deleted_at IS NULL) AND (status = 'approved'::text) AND (scheme_id = 'd12bb308-222b-4772-80d7-fda44d671aa5'::uuid) AND (approved_at <= now()))
              Rows Removed by Filter: 333333
              Buffers: shared hit=3168 read=96834
Planning Time: 66.032 ms
Execution Time: 1263.534 ms
```

- **Plan Bottleneck**: The planner performs a `Parallel Seq Scan on plot`, reading **96,834 buffer pages (~775 MB)** to evaluate `scheme_id` and `status` with `approved_at <= now()`.
- **Resolution**: Kept as strictly **FAIL** for BE-5.3. A composite index on `(scheme_id, status, approved_at)` and decoupling compute execution will be addressed in its own dedicated optimization PR.

---

## 8. Dedicated Test Users Created by Seed

The load seed (`packages/db/src/seed/load-seed.ts`) idempotently provisions dedicated performance testing users:

1. **`perf_national@idmis.gov.ng`**:
   - Role: `slis_admin` (`018f3a5e-0000-7000-8000-000000000019`)
   - Module: `slis`
   - Scope Type: `national` (`scope_state_id`: `NULL`, `scope_org_id`: `NULL`)
2. **`perf_state@idmis.gov.ng`**:
   - Role: `slis_admin` (`018f3a5e-0000-7000-8000-000000000019`)
   - Module: `slis`
   - Scope Type: `state`
   - Scoped State: **Kano State** (`018f3a5e-0001-7000-8000-000000000020`)
3. **`perf_scheme@idmis.gov.ng`**:
   - Role: `slis_admin` (`018f3a5e-0000-7000-8000-000000000019`)
   - Module: `slis`
   - Scope Type: `scheme`
   - Scoped Organisation: **Kano River Irrigation Scheme (KRIS)** (`d12bb308-222b-4772-80d7-fda44d671aa5`)
