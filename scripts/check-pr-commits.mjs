import { execSync } from 'node:child_process';
import { validateCommitMessage } from './check-commit-msg.mjs';

const baseRef = process.argv[2];
const headRef = process.argv[3];

if (!baseRef || !headRef) {
  console.error('Usage: node scripts/check-pr-commits.mjs <base-ref> <head-ref>');
  process.exit(1);
}

const allowedEmailsEnv = process.env.ALLOWED_AUTHOR_EMAILS?.trim();
let allowedEmails = null;

if (allowedEmailsEnv) {
  allowedEmails = new Set(
    allowedEmailsEnv
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
} else {
  console.warn(
    '⚠️ Warning: ALLOWED_AUTHOR_EMAILS is empty. Skipping author/committer email whitelist check.',
  );
}

let gitLogOutput = '';
try {
  gitLogOutput = execSync(
    `git log --format="%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e" ${baseRef}..${headRef}`,
    { encoding: 'utf8' },
  );
} catch (error) {
  console.error(`Error executing git log for range ${baseRef}..${headRef}:`, error.message);
  process.exit(1);
}

const records = gitLogOutput
  .split('\x1e')
  .map((r) => r.trim())
  .filter(Boolean);

if (records.length === 0) {
  console.log(`No commits found in range ${baseRef}..${headRef}.`);
  process.exit(0);
}

const violations = [];

for (const record of records) {
  const parts = record.split('\x1f');
  if (parts.length < 6) {
    continue;
  }

  const [hash, authorName, authorEmail, committerName, committerEmail, message] = parts;
  const shortHash = hash.slice(0, 8);

  // 1. Check message for AI / agent attribution
  const messageValidation = validateCommitMessage(message);
  if (!messageValidation.valid) {
    violations.push({
      hash: shortHash,
      reason: `Prohibited AI attribution detected in commit message: "${messageValidation.matchedLine}"`,
    });
  }

  // 2. Check author / committer email against whitelist
  if (allowedEmails) {
    if (!allowedEmails.has(authorEmail.toLowerCase())) {
      violations.push({
        hash: shortHash,
        reason: `Author email "${authorEmail}" (${authorName}) is not in ALLOWED_AUTHOR_EMAILS whitelist.`,
      });
    }

    if (!allowedEmails.has(committerEmail.toLowerCase())) {
      violations.push({
        hash: shortHash,
        reason: `Committer email "${committerEmail}" (${committerName}) is not in ALLOWED_AUTHOR_EMAILS whitelist.`,
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    `\n✖ Commit hygiene check failed: ${violations.length} violation(s) found in range ${baseRef}..${headRef}:\n`,
  );
  for (const v of violations) {
    console.error(`  - Commit [${v.hash}]: ${v.reason}`);
  }
  console.error(
    '\nRule: All commits must adhere to human identity standards, use authorized developer emails, and contain zero AI/agent attribution.\n',
  );
  process.exit(1);
}

console.log(
  `✓ All ${records.length} commit(s) in range ${baseRef}..${headRef} pass hygiene checks.`,
);
