import readline from 'node:readline';
import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { db } from './index';
import { appUser, assignment, auditLog } from './schema';
import { SYSTEM_USER_ID, ROLE_SYSTEM_ADMIN_ID } from './constants';

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  'admin123',
  '1234567890',
  '12345678',
  '123456789',
  'qwertyuiop',
  'letmein123',
  'idmis12345',
  'changeme123',
  'welcome123',
  'systemadmin',
  'passcode123',
  'nigeria1234',
  'triming1234',
]);

export function validatePasswordStrength(password: string): void {
  if (password.length < 10) {
    throw new Error('Password must be at least 10 characters long.');
  }
  if (password.length > 128) {
    throw new Error('Password cannot exceed 128 characters.');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase().trim())) {
    throw new Error('Password is too common or easily guessable.');
  }
}

async function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (process.stdin.isTTY) {
    return new Promise((resolve) => {
      process.stdout.write(question);
      let buffer = '';
      const onData = (char: Buffer) => {
        const str = char.toString('utf-8');
        if (str === '\n' || str === '\r' || str === '\u0004') {
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          rl.close();
          resolve(buffer);
        } else if (str === '\u0003') {
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode(false);
          process.exit(1);
        } else if (str === '\b' || str === '\x7f') {
          buffer = buffer.slice(0, -1);
        } else {
          buffer += str;
        }
      };
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', onData);
    });
  }

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export interface CreateAdminOptions {
  confirm?: string;
  email?: string;
  fullName?: string;
  passwordHash?: string;
  resetPassword?: boolean;
  passwordPrompt?: (promptText: string) => Promise<string>;
}

export async function createAdmin(
  options?: CreateAdminOptions,
): Promise<{ userId: string; action: 'created' | 'reset' }> {
  // 1. Confirmation check
  const confirm = options?.confirm ?? process.env.CREATE_ADMIN_CONFIRM;
  if (confirm !== 'yes') {
    throw new Error('Refusing to run unless CREATE_ADMIN_CONFIRM=yes is set.');
  }

  // 2. Reject plaintext passwords in environment variables or CLI arguments
  const forbiddenEnvKeys = [
    'ADMIN_PASSWORD',
    'PASSWORD',
    'ADMIN_PASS',
    'PASS',
    'PLAINTEXT_PASSWORD',
  ];
  for (const key of forbiddenEnvKeys) {
    if (process.env[key]) {
      throw new Error(
        `Plaintext password detected in env variable ${key}. Plaintext passwords are not permitted via environment variables or CLI arguments. Use ADMIN_PASSWORD_HASH or the interactive prompt.`,
      );
    }
  }

  for (const arg of process.argv) {
    if (
      arg.startsWith('--password') ||
      arg.startsWith('-p=') ||
      arg === '-p' ||
      arg.startsWith('--pass')
    ) {
      throw new Error(
        'Plaintext password detected in CLI argument. Plaintext passwords are not permitted via environment variables or CLI arguments. Use ADMIN_PASSWORD_HASH or the interactive prompt.',
      );
    }
  }

  // 3. Required fields
  const email = (options?.email ?? process.env.ADMIN_EMAIL)?.trim();
  const fullName = (options?.fullName ?? process.env.ADMIN_FULL_NAME)?.trim();

  if (!email) {
    throw new Error('ADMIN_EMAIL is required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL is not a valid email address.');
  }
  if (!fullName) {
    throw new Error('ADMIN_FULL_NAME is required.');
  }

  // 4. Password resolution
  let passwordHash: string;
  const envHash = (options?.passwordHash ?? process.env.ADMIN_PASSWORD_HASH)?.trim();

  if (envHash) {
    if (!envHash.startsWith('$argon2id$')) {
      throw new Error(
        'ADMIN_PASSWORD_HASH must be a valid Argon2id hash starting with "$argon2id$".',
      );
    }
    passwordHash = envHash;
  } else if (options?.passwordPrompt) {
    const p1 = await options.passwordPrompt('Enter admin password: ');
    const p2 = await options.passwordPrompt('Confirm admin password: ');
    if (p1 !== p2) {
      throw new Error('Passwords do not match.');
    }
    validatePasswordStrength(p1);
    passwordHash = await argon2.hash(p1, { type: argon2.argon2id });
  } else {
    const p1 = await promptHidden('Enter admin password: ');
    const p2 = await promptHidden('Confirm admin password: ');
    if (p1 !== p2) {
      throw new Error('Passwords do not match.');
    }
    validatePasswordStrength(p1);
    passwordHash = await argon2.hash(p1, { type: argon2.argon2id });
  }

  // 5. Check if user already exists
  const isResetPassword = options?.resetPassword ?? process.argv.includes('--reset-password');
  const normalizedEmail = email.toLowerCase();
  const [existingUser] = await db.select().from(appUser).where(eq(appUser.email, normalizedEmail));

  if (!isResetPassword) {
    if (existingUser) {
      throw new Error(
        `User with email "${normalizedEmail}" already exists. Use --reset-password to update their password.`,
      );
    }

    const userId = crypto.randomUUID();
    const username = normalizedEmail.split('@')[0];

    await db.transaction(async (tx) => {
      // (a) Insert app_user
      await tx.insert(appUser).values({
        id: userId,
        email: normalizedEmail,
        username,
        fullName,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        failedSignIns: 0,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // (b) Insert assignment
      await tx.insert(assignment).values({
        id: crypto.randomUUID(),
        userId,
        roleId: ROLE_SYSTEM_ADMIN_ID,
        module: 'core',
        scopeType: 'national',
        canCaptureOffline: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      });

      // (c) Insert audit_log
      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        actorType: 'system',
        actorUserId: SYSTEM_USER_ID,
        action: 'user.created',
        entityType: 'user',
        entityId: userId,
        changes: { after: { note: 'created via create-admin CLI' } },
      });
    });

    console.log(`System administrator created successfully: ${normalizedEmail}`);
    return { userId, action: 'created' };
  } else {
    if (!existingUser) {
      throw new Error(
        `Cannot reset password: user with email "${normalizedEmail}" does not exist.`,
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(appUser)
        .set({
          passwordHash,
          failedSignIns: 0,
          lockedUntil: null,
          updatedBy: SYSTEM_USER_ID,
          updatedAt: sql`NOW()`,
        })
        .where(eq(appUser.id, existingUser.id));

      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        actorType: 'system',
        actorUserId: SYSTEM_USER_ID,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: existingUser.id,
        changes: { after: { note: 'password reset via create-admin CLI' } },
      });
    });

    console.log(`Password reset successfully for user: ${normalizedEmail}`);
    return { userId: existingUser.id, action: 'reset' };
  }
}
