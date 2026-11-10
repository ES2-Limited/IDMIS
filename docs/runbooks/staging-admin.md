# Staging Administration & Operations Runbook

This runbook documents operational procedures for administering the TRIMING IDMIS platform on the Railway staging environment, including creating administrator accounts, resetting passwords, configuring multi-factor authentication (TOTP) enforcement, and executing reference geography seeding.

---

## 1. Prerequisites & Railway Connection

All administrative CLI tasks must be run directly inside the running API service container on Railway.

### 1.1 Authenticate and Link Project

Ensure you have the Railway CLI installed and authenticated:

```bash
# Verify authentication
railway whoami

# Link to the TRIMING IDMIS staging project
railway link
```

### 1.2 Access Container Shell

Open an interactive shell session into the API service:

```bash
railway ssh --service api
```

Once inside the container, the working directory is `/app`, and built CLI scripts are located under `packages/db/dist/cli/`.

---

## 2. Creating the First Administrator (`create-admin`)

After an initial deployment or database migration, the database will contain no active system administrators. Use the transactional `create-admin` CLI to provision the initial superuser.

### 2.1 Interactive Execution (Recommended)

Run the command with the required identity variables and confirmation guard:

```bash
CREATE_ADMIN_CONFIRM=yes \
ADMIN_EMAIL="admin@triming.org" \
ADMIN_FULL_NAME="System Administrator" \
node packages/db/dist/cli/create-admin.js
```

You will be prompted to enter and confirm the password interactively with hidden input:

```
[create-admin] Enter password for admin@triming.org: ********
[create-admin] Confirm password: ********
[create-admin] Success: Administrator admin@triming.org created with system_admin role.
```

### 2.2 Execution with Pre-Hashed Password

For non-interactive or automated workflows, generate an Argon2id password hash beforehand and supply it via `ADMIN_PASSWORD_HASH`:

```bash
CREATE_ADMIN_CONFIRM=yes \
ADMIN_EMAIL="admin@triming.org" \
ADMIN_FULL_NAME="System Administrator" \
ADMIN_PASSWORD_HASH='$argon2id$v=19$m=65536,t=3,p=4$...' \
node packages/db/dist/cli/create-admin.js
```

### 2.3 Safety Rules & Guarantees

- **No Plaintext Passwords in Env/Argv**: Providing a password via `ADMIN_PASSWORD` in the environment or `--password` in command arguments is strictly prohibited. The CLI rejects execution immediately to prevent credential leaks in shell history, process listings (`ps`), or container metadata.
- **Confirmation Guard**: The script requires `CREATE_ADMIN_CONFIRM=yes`. If unset or set to any other value, the CLI aborts without database operations.
- **Password Strength Enforcement**: Passwords must be at least 10 characters (maximum 128) and must not match common trivial passwords (e.g., `password123`, `admin12345`).
- **Atomic Transaction**: The user record in `core.app_user`, assignment in `core.assignment` (`role: system_admin`, `module: core`, `scope: national`, `can_capture_offline: true`), and audit record in `core.audit_log` are written within a single database transaction. If any step fails, the entire transaction rolls back.
- **Credential Protection**: Passwords and hashes are never printed to `stdout` or logged.
- **Deploy Seed Protection**: Deploy migrations and automated seeds (`seed.ts`) use `ON CONFLICT DO NOTHING` and will never overwrite existing administrator credentials or emails.

---

## 3. Resetting an Administrator Password (`--reset-password`)

If an administrator's account exists but their password is lost or requires rotation, use the `--reset-password` flag.

```bash
CREATE_ADMIN_CONFIRM=yes \
ADMIN_EMAIL="admin@triming.org" \
ADMIN_FULL_NAME="System Administrator" \
node packages/db/dist/cli/create-admin.js --reset-password
```

### Reset Behavior

1. The CLI verifies that an existing user with `ADMIN_EMAIL` exists in `core.app_user`.
2. It prompts for the new password twice (or reads `ADMIN_PASSWORD_HASH`) and validates password strength.
3. It updates `core.app_user.password_hash`, sets `must_change_password = false`, and records an audit log entry (`action: USER_PASSWORD_RESET`).
4. Running without `--reset-password` when the user already exists safely aborts with an error advising to pass `--reset-password`.

---

## 4. Multi-Factor Authentication (TOTP) Policy (`AUTH_TOTP_ENFORCE_ADMINS`)

The platform implements Time-Based One-Time Password (TOTP) enforcement for administrative roles (`system_admin`, `pmu_director`, etc.).

### 4.1 Environment Variable Configuration

| Variable                   | Type                     | Default | Staging Allowed             | Production Allowed |
| :------------------------- | :----------------------- | :------ | :-------------------------- | :----------------- |
| `AUTH_TOTP_ENFORCE_ADMINS` | boolean (`true`/`false`) | `true`  | `false` (temporary testing) | `true` (mandatory) |

### 4.2 Behavior Matrix

- **`AUTH_TOTP_ENFORCE_ADMINS=true` (Default)**:
  - Any user with an administrative role signing in without an enrolled TOTP secret receives `{ status: 'totp_setup_required' }` along with a QR code and secret URI. They cannot access protected admin routes until enrollment is completed.
- **`AUTH_TOTP_ENFORCE_ADMINS=false`**:
  - Administrators who have not yet enrolled TOTP are not blocked and can sign in directly with email and password (`{ status: 'authenticated' }`).
  - **Important**: Any user who has _already_ enrolled TOTP (`totpConfirmedAt` is set) will **always** receive `{ status: 'totp_required' }` and must provide a valid 6-digit TOTP code.
- **Production Audit Warning**:
  - When `AUTH_TOTP_ENFORCE_ADMINS=false` and `NODE_ENV=production`, the API logs a warning at application bootstrap:
    `"Admin TOTP enforcement is DISABLED"`.
  - In staging environments, setting this flag to `false` simplifies manual end-to-end testing and initial QA verification.

---

## 5. Reference Geography Seeding on Railway

Public geography reference data (37 States, 774 LGAs, 5,691 Wards) is bundled directly into the API runner container image at `/app/packages/db/src/seed/reference`.

### 5.1 Executing the Reference Seed

Connect via Railway SSH to the API container:

```bash
railway ssh --service api
```

Run the seed script with the confirmation variable:

```bash
REFERENCE_SEED_CONFIRM=yes node packages/db/dist/cli/seed-reference.js
```

### 5.2 Expected Output

```
Table state: 0 inserted / 0 updated / 37 unchanged
Table lga: 0 inserted / 0 updated / 774 unchanged
Table ward: 5691 inserted / 0 updated / 0 unchanged
```

_(Note: If states or LGAs were not previously seeded, they will report inserted counts accordingly.)_

### 5.3 Database Verification

Verify record counts in PostgreSQL:

```sql
SELECT count(*) FROM core.state; -- Expected: 37
SELECT count(*) FROM core.lga;   -- Expected: 774
SELECT count(*) FROM core.ward;  -- Expected: 5691
```

For full details on boundary datasets, frozen snapshots, and ward import procedures, consult `docs/runbooks/reference-data.md`.
