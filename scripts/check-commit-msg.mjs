import fs from 'node:fs';

export const BLOCKED_PATTERNS = [
  /co-authored-by:.*(\[bot\]|\bbot\b|\bai\b|claude|gemini|antigravity|copilot|cursor|codex|\bgpt)/i,
  /generated (with|by)/i,
];

export function validateCommitMessage(message) {
  const lines = message.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('#')) {
      continue;
    }
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(line)) {
        return {
          valid: false,
          matchedLine: line.trim(),
          pattern: pattern.toString(),
        };
      }
    }
  }
  return { valid: true };
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('check-commit-msg.mjs') ||
    process.argv[1].endsWith('check-commit-msg'));

if (isDirectRun && process.argv[2]) {
  const commitMsgFile = process.argv[2];
  try {
    const content = fs.readFileSync(commitMsgFile, 'utf8');
    const result = validateCommitMessage(content);
    if (!result.valid) {
      console.error(
        '\n✖ Commit rejected: AI or automated agent attribution detected in commit message.',
      );
      console.error(`  Matched line: "${result.matchedLine}"`);
      console.error(
        "  Rule: Commits must use the developer's own git identity. Never add Co-authored-by, Generated-with, or any AI/agent attribution.\n",
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error reading commit message file: ${error.message}`);
    process.exit(1);
  }
}
