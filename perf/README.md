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

> **Note on Performance User Roles:** Benchmark test users are assigned the `field_officer` role (`can_capture_offline: true`, full sync permissions across the scheme/state) rather than administrative roles (`system_admin`, `slis_admin`), because administrative roles require mandatory two-factor authentication (TOTP) under security policy.

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

| Operation / Scenario                       | Baseline p95 (Before Tuning) | Tuned p95 (After Tuning) | Target Threshold    | Source   | VUs    | Duration | Result                                  |
| :----------------------------------------- | :--------------------------- | :----------------------- | :------------------ | :------- | :----- | :------- | :-------------------------------------- |
| **Farmer List (National, paged)**          | 241.1 ms                     | **123.4 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer List (State-scoped, paged)**      | 197.0 ms                     | **129.0 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer List (Scheme-scoped, paged)**     | 200.1 ms                     | **143.7 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer Search (Common name substring)**  | 269.8 ms                     | **173.1 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Farmer Search (Rare code / 1 match)**    | 2,504.8 ms _(seq scan)_      | **262.4 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 30 s     | **PASS (9.5x speedup)**                 |
| **Plot List (National, paged)**            | 111.5 ms                     | **108.6 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot List (State-scoped, paged)**        | 143.4 ms                     | **131.8 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot List (Scheme-scoped, paged)**       | 135.2 ms                     | **109.1 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot Filtered (State + Service Type)**   | 156.0 ms                     | **108.7 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS**                                |
| **Plot Search (`ILIKE` substring)**        | 6,520.0 ms                   | **101.8 ms**             | < 500 ms            | k6 p(95) | 20 VUs | 60 s     | **PASS (64x speedup)**                  |
| **Sync Pull (batch of 500 changes)**       | 1.94 s                       | **66.71 ms – 72.26 ms**  | < 1.5 s _(prov.)_   | k6 p(95) | 2 VUs  | 30 s     | **PASS**                                |
| **Sync Push (200 ops, worker on - Valid)** | 13.40 s _(invalid payload)_  | **1.25 s – 1.29 s**      | < 2.0 s _(prov.)_   | k6 p(95) | 2 VUs  | 30 s     | **PASS**                                |
| **Import Validate & Commit (100k rows)**   | Pending Staging S3           | Pending Staging S3       | < 10 mins _(prov.)_ | N/A      | N/A    | N/A      | **NOT MEASURED — to be run on staging** |

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

### 7.2 Sync Push Benchmark Runs & Retest History

> **Important Note on Sync Benchmarks:**
>
> 1. Initial benchmarks (~12.80 s – 13.40 s) were **INVALID** because the k6 push payload omitted the required `level` attribute on `slis.water_request` (`water_request.level` is `NOT NULL`). Every operation in the batch failed validation at the database level with a NOT NULL constraint violation, forcing savepoint rollbacks and error writes to `core.sync_op`.
> 2. The earlier reported `5.08 s` sync push and `2.45 s` sync pull results occurred because the un-debounced compute worker executed hundreds of unindexed aggregate queries over 1,000,000 rows concurrently, saturating database CPU and buffer cache.
> 3. With the debouncing mechanism in `MeComputeService` (collapsing burst events into at most 1 scheme job and 1 global job per window) and consolidated covering `INCLUDE` indexes in migration `0025`, two consecutive verification runs were executed with compute worker ON under full load (2 concurrent VUs, 30 s duration, batches of 200 operations, valid payloads with `level: 'individual'` and valid `farmerId`, and an assertion that 100% of operations return `outcome: 'applied'`):
>
> - **Run 1 (Compute ON, 2 VUs, 30 s, Valid Payloads, 100% Applied)**:
>   - `sync_push` p95: **1.29 s** (**PASS**, target < 2.0 s)
>   - `sync_pull` p95: **66.71 ms** (**PASS**, target < 1.5 s)
>   - Ops Outcome: **100.00% applied** (154/154 checks passed, 0 failures)
> - **Run 2 (Compute ON, 2 VUs, 30 s, Valid Payloads, 100% Applied)**:
>   - `sync_push` p95: **1.25 s** (**PASS**, target < 2.0 s)
>   - `sync_pull` p95: **72.26 ms** (**PASS**, target < 1.5 s)
>   - Ops Outcome: **100.00% applied** (154/154 checks passed, 0 failures)
>
> Both runs comfortably pass the provisional < 2.0 s push threshold and are faster than the 1.30 s – 1.51 s range observed on #118.

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

## 8. Compute Storm Optimization & Index Consolidation (`fix/me-compute-storm`)

Migration `0025_me_compute_storm_indexes.sql` consolidates list pagination and analytical indexes on `slis.plot` and `slis.farmer` into unified covering `INCLUDE` indexes, eliminating 6 redundant single-purpose indexes that previously degraded sync write throughput. In addition, `SlisComputeQueryService` replaced redundant `count(distinct id)` on primary key columns with `count(*)`.

### 8.1 Index Consolidation Details

To eliminate write amplification during batch sync pushes:

1. **`slis.plot`**:
   - Replaced separate `plot_scheme_status_id_idx` and `plot_scheme_status_compute_idx` with **one consolidated index**:
     `plot_scheme_status_id_idx` `btree (scheme_id, status, id) INCLUDE (service_type, area_ha, approved_at, deleted_at)`
   - Replaced separate `plot_state_status_id_idx` and `plot_state_status_compute_idx` with **one consolidated index**:
     `plot_state_status_id_idx` `btree (state_id, status, id) INCLUDE (service_type, area_ha, approved_at, deleted_at)`
   - Dropped redundant `plot_status_idx` (completely subsumed by `plot_status_compute_idx` on `(status) INCLUDE (...)`).
2. **`slis.farmer`**:
   - Replaced separate `farmer_scheme_status_id_idx` and `farmer_scheme_status_compute_idx` with **one consolidated index**:
     `farmer_scheme_status_id_idx` `btree (scheme_id, status, id) INCLUDE (gender, approved_at, deleted_at)`
   - Replaced separate `farmer_state_status_id_idx` and `farmer_state_status_compute_idx` with **one consolidated index**:
     `farmer_state_status_id_idx` `btree (state_id, status, id) INCLUDE (gender, approved_at, deleted_at)`
   - Dropped redundant `farmer_status_idx` (completely subsumed by `farmer_status_compute_idx` on `(status) INCLUDE (...)`).

#### Final Index Lists:

- **`slis.plot` (10 indexes total)**:
  1. `plot_pkey`: PRIMARY KEY, btree (`id`)
  2. `plot_code_trgm_idx`: gin (`plot_code` gin_trgm_ops)
  3. `plot_scheme_code_unique`: UNIQUE, btree (`scheme_id`, `plot_code`)
  4. `plot_scheme_id_idx`: btree (`scheme_id`)
  5. `plot_scheme_status_id_idx`: btree (`scheme_id`, `status`, `id`) INCLUDE (`service_type`, `area_ha`, `approved_at`, `deleted_at`)
  6. `plot_sector_id_idx`: btree (`sector_id`)
  7. `plot_state_service_type_id_idx`: btree (`state_id`, `service_type`, `id`)
  8. `plot_state_status_id_idx`: btree (`state_id`, `status`, `id`) INCLUDE (`service_type`, `area_ha`, `approved_at`, `deleted_at`)
  9. `plot_status_compute_idx`: btree (`status`) INCLUDE (`service_type`, `area_ha`, `approved_at`, `deleted_at`)
  10. `plot_ward_id_idx`: btree (`ward_id`)

- **`slis.farmer` (9 indexes total)**:
  1. `farmer_pkey`: PRIMARY KEY, btree (`id`)
  2. `farmer_phone_idx`: btree (`phone`)
  3. `farmer_scheme_code_unique`: UNIQUE, btree (`scheme_id`, `farmer_code`)
  4. `farmer_scheme_id_idx`: btree (`scheme_id`)
  5. `farmer_scheme_status_id_idx`: btree (`scheme_id`, `status`, `id`) INCLUDE (`gender`, `approved_at`, `deleted_at`)
  6. `farmer_search_trgm_idx`: gin (`farmer_code` gin_trgm_ops, `first_name` gin_trgm_ops, `last_name` gin_trgm_ops, `phone` gin_trgm_ops)
  7. `farmer_state_status_id_idx`: btree (`state_id`, `status`, `id`) INCLUDE (`gender`, `approved_at`, `deleted_at`)
  8. `farmer_status_compute_idx`: btree (`status`) INCLUDE (`gender`, `approved_at`, `deleted_at`)
  9. `farmer_ward_id_idx`: btree (`ward_id`)

Both the list queries (`GET /plots` and `GET /farmers` with cursor pagination) and analytical aggregation queries utilize index scans and parallel index-only scans on these consolidated indexes, avoiding sequential scans and maintaining sub-second query performance.

### 8.2 Top Queries During Sync Push (`pg_stat_statements`)

With debouncing active and consolidated indexes applied, `pg_stat_statements` shows that analytical queries are eliminated from the top queries list. Execution time is dominated by fast OLTP writes:

| Total Time (ms) | Calls | Mean Time (ms) | Query Preview                                                 |
| :-------------- | :---- | :------------- | :------------------------------------------------------------ |
| **1,624.97**    | 6,000 | 0.27           | `insert into "slis"."water_request" ("id", "version", ...)`   |
| **487.28**      | 6,000 | 0.08           | `insert into "core"."audit_log" ("id", "occurred_at", ...)`   |
| **389.03**      | 6,000 | 0.06           | `insert into "core"."sync_op" ("op_id", "device_id", ...)`    |
| **267.30**      | 6,000 | 0.04           | `update "core"."sync_op" set "outcome" = $1, ...`             |
| **199.87**      | 6,000 | 0.03           | `insert into "core"."outbox_event" ("id", "event_type", ...)` |
| **193.08**      | 30    | 6.44           | `select "id", "version", ... from "slis"."water_request"`     |
| **58.98**       | 6,000 | 0.01           | `select "id", "type", "parent_id" from "core"."organisation"` |
| **57.77**       | 30    | 1.93           | `select "xid", "seq", "entity", ... from "core"."change_log"` |
| **51.42**       | 6,000 | 0.01           | `select "state_id" from "core"."organisation_state"`          |
| **47.00**       | 6,000 | 0.01           | `select "id", "sector_id" from "slis"."farmer"`               |

### 8.3 Before vs After Query Timing on 1,000,000 Dataset

| Query Target                      | Level    | Baseline Plan & Duration                                 | Optimized Plan & Duration                              | Speedup   | Sequential Scan |
| :-------------------------------- | :------- | :------------------------------------------------------- | :----------------------------------------------------- | :-------- | :-------------- |
| **`slis.plot` (Area Serviced)**   | Scheme   | Parallel Seq Scan (**6,529.4 ms**, 99,975 buffers)       | Parallel Index Only Scan (**148.0 ms**, 1,723 buffers) | **44.1x** | **NONE**        |
| **`slis.plot` (Area Serviced)**   | State    | Parallel Seq Scan (**670.3 ms**, 99,879 buffers)         | Parallel Index Only Scan (**139.7 ms**, 1,700 buffers) | **4.8x**  | **NONE**        |
| **`slis.plot` (Area Serviced)**   | National | Parallel Seq Scan (**3,903.7 ms**, 99,783 buffers)       | Parallel Index Only Scan (**302.4 ms**, 6,837 buffers) | **12.9x** | **NONE**        |
| **`slis.farmer` (Beneficiaries)** | Scheme   | Bitmap Heap Scan + Sort (**2,815.5 ms**, 33,334 buffers) | Parallel Index Only Scan (**97.4 ms**, 1,434 buffers)  | **28.9x** | **NONE**        |
| **`slis.farmer` (Beneficiaries)** | State    | Parallel Seq Scan + Sort (**899.9 ms**, 19,422 buffers)  | Parallel Index Only Scan (**130.4 ms**, 1,432 buffers) | **6.9x**  | **NONE**        |
| **`slis.farmer` (Beneficiaries)** | National | Parallel Seq Scan + Sort (**366.9 ms**, 19,326 buffers)  | Parallel Index Only Scan (**276.2 ms**, 4,929 buffers) | **1.3x**  | **NONE**        |

### 8.4 Debounce & Deduplication Verification

- **Configurable Debounce Window**: `ME_COMPUTE_DEBOUNCE_MS` (default 60000 ms = 1 minute), read from validated `env.ts`.
- **Deduplication Enforcement**: When rapid event bursts occur (e.g. 500 `water_request` creates), events collapse into exactly **one scheme job** (`debounce-scheme-${schemeId}`) and **one global job** (`debounce-global`). Subsequent triggers during the waiting window do not duplicate or reset the job delay.
- **Invariance Guarantee**: Automated tests (`apps/api/src/modules/me/compute-storm.spec.ts`) verify that optimized `count(*)` outputs match the previous `count(distinct id)` outputs byte-for-byte across scheme, state, and national scopes.

---

## 9. Dedicated Test Users Created by Seed

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
