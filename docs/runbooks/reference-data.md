# Reference Data Runbook: Public Geography & Organisation Seeding

This runbook describes how to seed public geography reference data (States, LGAs, Wards) on staging and production environments, verify database counts, import missing or unmatched wards, and import client reference data (Organisations: RBDAs, Schemes, Sectors; and Water User Associations).

---

## 1. Public Geography Seed (`pnpm db:seed:reference`)

The reference geography seed populates official Nigerian administrative boundaries:

- **37 States / FCT**: Mapped from OCHA COD-AB Nigeria (`NG001`..`NG037`). Preserves existing UUIDs and 2-letter codes (`AB`..`ZA`).
- **774 LGAs**: Extracted from OCHA COD-AB Nigeria with P-codes (`NG001001`..`NG037014`). Uses deterministic UUID v5.
- **5,637 Wards**: Extracted from GRID3 NGA Operational Wards v3.0 for 24 covered states (including all 5 TRIMING programme states). Uses deterministic UUID v5.

### Pre-Requisites & Safety Guarantees

- **Safety Guard**: The command requires `REFERENCE_SEED_CONFIRM=yes`. It immediately aborts if unset.
- **Idempotency**: Uses `ON CONFLICT (code) DO UPDATE`. Re-running changes nothing and creates no duplicates.
- **Non-Destructive**: Never deletes or modifies operational data.
- **Parent Validation**: Pre-validates all state and LGA references before initiating writes; aborts cleanly if any parent link is broken.

### Staging Execution

Run the seed command in the staging deployment container or release task:

```bash
# Verify environment variable is set
export REFERENCE_SEED_CONFIRM=yes

# Execute via workspace root
pnpm db:seed:reference
```

Expected command output:

```
[seed:reference] Starting reference geography seed...
[seed:reference] Pre-validating reference dataset integrity...
[seed:reference] Found 37 states, 774 LGAs, 5637 wards to seed.
[seed:reference] Reference dataset integrity validated successfully.
[seed:reference] Seeding states...
[seed:reference] Table state: 0 inserted / 0 updated / 37 unchanged
[seed:reference] Seeding LGAs...
[seed:reference] Table lga: 774 inserted / 0 updated / 0 unchanged
[seed:reference] Seeding wards...
[seed:reference] Table ward: 5691 inserted / 0 updated / 0 unchanged
[seed:reference] Reference geography seed completed successfully in 1.42s.
```

_(Note: On subsequent runs, all counts will report `0 inserted / 0 updated / X unchanged`.)_

> [!IMPORTANT]
> **Frozen Snapshot Notice & Seed Safety Rules:**
>
> 1. The v3.0 extraction is a **frozen baseline snapshot**. Because `OBJECTID` is software-generated in spatial exports, **never re-extract from a newer GRID3 version without explicit code remapping and verification**; doing so could silently turn one ward into another.
> 2. Any new, missing, or corrected wards must go in through the **Ward Import wizard** (`dataset = ward`) rather than automated re-extraction.
> 3. **Prohibited Parent Changes**: Any change to an existing ward's parent LGA (or an existing LGA's parent State) aborts the seed run with an error and performs zero database writes.
> 4. **Rename Protection**: Modifying an existing ward or LGA name aborts with an error unless `REFERENCE_ALLOW_RENAMES=yes` is explicitly set in the environment. When enabled, every applied rename is audited and printed to stdout.

### Verification Queries

Connect to the PostgreSQL database (`psql`) and run:

#### 1. Total Counts Check

```sql
SELECT 'core.state' AS entity, count(*) AS total_count FROM core.state
UNION ALL
SELECT 'core.lga', count(*) FROM core.lga
UNION ALL
SELECT 'core.ward', count(*) FROM core.ward;
```

**Expected Output:**

| entity       | total_count |
| :----------- | :---------- |
| `core.state` | 37          |
| `core.lga`   | 774         |
| `core.ward`  | 5691        |

#### 2. Spot Check TRIMING Programme States

```sql
SELECT
  s.code AS state_code,
  s.name AS state_name,
  count(DISTINCT l.id) AS lga_count,
  count(DISTINCT w.id) AS ward_count
FROM core.state s
LEFT JOIN core.lga l ON l.state_id = s.id
LEFT JOIN core.ward w ON w.lga_id = l.id
WHERE s.code IN ('KN', 'JI', 'SO', 'ZA', 'GM')
GROUP BY s.code, s.name
ORDER BY s.code;
```

**Expected Counts:**

| State Code | State Name | LGAs | Wards |
| :--------- | :--------- | :--- | :---- |
| `GM`       | Gombe      | 11   | 114   |
| `JI`       | Jigawa     | 27   | 288   |
| `KN`       | Kano       | 44   | 484   |
| `SO`       | Sokoto     | 23   | 244   |
| `ZA`       | Zamfara    | 14   | 147   |

---

## 2. Resolving and Importing Missing Wards

### Context

GRID3 NGA Operational Wards v3.0 contains 181 wards (in non-TRIMING states) whose LGA names could not be matched automatically to official OCHA COD-AB LGA boundaries without guessing. These are catalogued in `packages/db/src/seed/reference/unmatched-wards.csv`.

### Import Procedure Once LGA Is Confirmed

1. Review `packages/db/src/seed/reference/unmatched-wards.csv` with the state/client representative to determine the official LGA P-code for each ward.
2. Download the Ward import template from the IDMIS Web UI:
   - Navigate to **Settings > Data Imports > Download Template**.
   - Select **Wards** (`dataset = ward`).
   - Alternatively, call `GET /imports/template/ward` via API.
3. In Excel, populate the **Data** sheet:
   | Column        | Description                                        | Example        |
   | :------------ | :------------------------------------------------- | :------------- |
   | `Ward Code *` | Unique ward identifier (e.g. `G3-<grid3_ward_id>`) | `G3-1001`      |
   | `Ward Name *` | Official ward name                                 | `Dawanau Ward` |
   | `LGA Code *`  | Official COD-AB LGA P-code                         | `NG020001`     |
4. Upload via the Web UI Import Wizard:
   - Click **New Import**, select **Wards**, and upload the completed `.xlsx` file.
   - The system checks file scan status (ClamAV) and validates LGA parent references and state scoping.
   - Preview the batch: verify `status: "validated"` and `validRows` matches total.
   - Click **Commit Import**. The rows will be upserted into `core.ward`.

---

## 3. Importing Client Organisations & WUAs

The IDMIS monolith provides dataset handlers for importing hierarchical client organisations and Water User Associations (WUAs).

### Organisation Hierarchy & Parent Rules

Organisations follow strict parentage constraints:

1. **`rbda` (River Basin Development Authority)**:
   - Top-level administrative entity (e.g. `HJRBDA` - Hadejia-Jama'are River Basin Development Authority).
   - Parent code is optional (normally `null`).
   - Permission: Requires national administrative scope (`CORE_ORGANISATION_MANAGE`).
2. **`scheme` (Irrigation Scheme)**:
   - Must reference an existing `rbda` in `parent_code` (e.g. `KRIS` references `HJRBDA`).
   - Rejection rule: If `parent_code` is missing, does not exist, or references a non-`rbda`, the row fails validation.
3. **`sector` (Irrigation Sector)**:
   - Must reference an existing `scheme` in `parent_code` (e.g. `SEC1` references `KRIS`).
   - Rejection rule: If `parent_code` is missing, does not exist, or references a non-`scheme` (e.g. referencing an `rbda` directly), the row fails validation.

### Organisation Import Template Columns

| Header                | Key                 | Type   | Description                                                 |
| :-------------------- | :------------------ | :----- | :---------------------------------------------------------- |
| `Organisation Code *` | `code`              | String | Unique code (e.g. `HJRBDA`, `KRIS`, `SEC01`)                |
| `Organisation Name *` | `name`              | String | Full entity name                                            |
| `Type *`              | `type`              | Enum   | `rbda`, `scheme`, or `sector`                               |
| `Parent Code`         | `parent_code`       | String | Required for `scheme` (RBDA) and `sector` (Scheme)          |
| `State Codes`         | `state_codes`       | String | Comma-separated 2-letter state codes (e.g. `KN` or `KN,JI`) |
| `Short Name`          | `short_name`        | String | Optional abbreviation                                       |
| `Irrigable Area (Ha)` | `irrigable_area_ha` | Number | Optional irrigable area in hectares (schemes/sectors)       |
| `Address`             | `address`           | String | Optional physical address                                   |
| `Phone`               | `phone`             | String | Optional contact phone number                               |
| `Email`               | `email`             | String | Optional contact email address                              |

### Water User Association (WUA) Import Columns

WUAs belong to irrigation schemes and optionally link to geographical wards:

| Header                      | Key                 | Type   | Description                                               |
| :-------------------------- | :------------------ | :----- | :-------------------------------------------------------- |
| `WUA Registration Number *` | `regNo`             | String | Unique registration number                                |
| `WUA Name *`                | `name`              | String | Full name of the WUA                                      |
| `Scheme Code *`             | `schemeCode`        | String | Must match an existing scheme code in `core.organisation` |
| `Ward Code`                 | `wardCode`          | String | Optional; must match an existing ward in `core.ward`      |
| `Level *`                   | `level`             | Enum   | `primary`, `secondary`, or `tertiary`                     |
| `Bank Name`                 | `bankName`          | String | Bank name (encrypted at rest)                             |
| `Account Number`            | `bankAccountNumber` | String | Account number (encrypted at rest)                        |
| `Phone`                     | `phone`             | String | Contact phone number                                      |

### Import Execution Steps

1. **Download Template**: In the UI, navigate to **Settings > Data Imports > Download Template > Organisations**.
2. **Fill Spreadsheet**: Populate rows top-down (RBDAs first, then Schemes, then Sectors). The import engine resolves intra-batch parent dependencies in a single transaction.
3. **Dry-Run Preview**:
   - Upload the spreadsheet.
   - The validation engine performs scope checks, parent rule verification, and syntax checks without modifying live data.
   - The preview table highlights cell-level errors (e.g. missing parent or invalid state code).
4. **Commit Batch**:
   - When all rows pass validation, click **Commit**.
   - Writes occur atomically in a database transaction with audit logging and outbox events.
5. **Rollback / Undo (if necessary)**:
   - If an import batch requires cancellation, click **Undo Import**.
   - Undo safely soft-deletes inserted entities or restores previous field versions from before-images, processing child records before parent records to maintain referential integrity.
