import * as argon2 from 'argon2';
import { client, db, appUser, assignment, role, eq, sql, SYSTEM_USER_ID } from '../index';

export const TEST_OFFICER_ID = '018f3a5e-0000-7000-8000-000000000002';
export const TEST_OFFICER_EMAIL = 'field-officer@example.org';

export async function seedTestOfficer() {
  const password = process.env.TEST_USER_PASSWORD;
  if (!password) {
    throw new Error('TEST_USER_PASSWORD environment variable is required');
  }

  console.log(`Seeding test officer: ${TEST_OFFICER_EMAIL}`);

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  await db
    .insert(appUser)
    .values({
      id: TEST_OFFICER_ID,
      email: TEST_OFFICER_EMAIL,
      username: 'field_officer',
      fullName: 'Test Field Officer',
      passwordHash,
      isActive: true,
      mustChangePassword: false,
      totpConfirmedAt: null,
      totpSecretEnc: null,
      failedSignIns: 0,
      lockedUntil: null,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    })
    .onConflictDoUpdate({
      target: appUser.id,
      set: {
        email: TEST_OFFICER_EMAIL,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        totpConfirmedAt: null,
        totpSecretEnc: null,
        failedSignIns: 0,
        lockedUntil: null,
        updatedAt: sql`NOW()`,
      },
    });

  // Find scheme_data_officer role
  const [dataOfficerRole] = await db.select().from(role).where(eq(role.key, 'scheme_data_officer'));

  if (dataOfficerRole) {
    await db
      .insert(assignment)
      .values({
        id: '018f3a5e-0000-7000-8000-000000000020',
        userId: TEST_OFFICER_ID,
        roleId: dataOfficerRole.id,
        module: 'core',
        scopeType: 'national',
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoNothing();
  }

  console.log('--- Test Field Officer Ready ---');
  console.log(`Email: ${TEST_OFFICER_EMAIL}`);
  console.log(`Role:  scheme_data_officer`);

  await client.end();
}

if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1].endsWith('seed-test-officer.ts'))
) {
  seedTestOfficer()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error seeding test officer:', err);
      process.exit(1);
    });
}
