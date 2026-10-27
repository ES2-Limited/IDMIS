import { client, db, appUser, session, totpRecoveryCode, eq, and, isNull, sql } from '../index';

export async function resetAdmin2fa(email?: string) {
  const targetEmail = (email || process.argv[2] || process.env.ADMIN_EMAIL || '').trim();

  if (!targetEmail) {
    console.error('Error: Target email required. Pass as argument or set ADMIN_EMAIL env var.');
    process.exit(1);
  }

  console.log(`Resetting 2FA credentials and revoking sessions for: ${targetEmail}`);

  const [user] = await db.select().from(appUser).where(eq(appUser.email, targetEmail));

  if (!user) {
    console.error(`Error: User with email "${targetEmail}" not found in core.app_user.`);
    await client.end();
    process.exit(1);
  }

  // 1. Clear TOTP secret, confirmed timestamp, and set mustChangePassword = true
  await db
    .update(appUser)
    .set({
      totpSecretEnc: null,
      totpConfirmedAt: null,
      mustChangePassword: true,
      failedSignIns: 0,
      lockedUntil: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(appUser.id, user.id));

  // 2. Delete all existing recovery codes
  const deletedCodes = await db
    .delete(totpRecoveryCode)
    .where(eq(totpRecoveryCode.userId, user.id))
    .returning();

  // 3. Revoke all active sessions
  const revokedSessions = await db
    .update(session)
    .set({
      revokedAt: sql`NOW()`,
    })
    .where(and(eq(session.userId, user.id), isNull(session.revokedAt)))
    .returning();

  console.log('--- 2FA Reset Complete ---');
  console.log(`User ID:               ${user.id}`);
  console.log(`Email:                 ${user.email}`);
  console.log(`TOTP Secret:           Cleared (NULL)`);
  console.log(`TOTP Confirmed At:     Cleared (NULL)`);
  console.log(`Must Change Password:  true`);
  console.log(`Recovery Codes Purged: ${deletedCodes.length}`);
  console.log(`Sessions Revoked:      ${revokedSessions.length}`);

  await client.end();
}

if (
  process.argv[1]?.endsWith('reset-admin-2fa.ts') ||
  process.argv[1]?.endsWith('reset-admin-2fa.js')
) {
  resetAdmin2fa().catch(async (err) => {
    console.error('Failed to reset admin 2FA:', err);
    try {
      await client.end();
    } catch {
      // ignore
    }
    process.exit(1);
  });
}
