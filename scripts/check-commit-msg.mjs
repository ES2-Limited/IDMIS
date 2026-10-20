import fs from 'node:fs';

const commitMsgFile = process.argv[2];

if (!commitMsgFile) {
  console.error('Error: No commit message file provided to check-commit-msg.mjs.');
  process.exit(1);
}

try {
  const content = fs.readFileSync(commitMsgFile, 'utf8');
  const lines = content.split('\n');

  const blockedPatterns = [
    /co-authored-by:.*(bot|ai\b|claude|gemini|antigravity|copilot|cursor|codex|gpt)/i,
    /generated (with|by)/i,
  ];

  for (const line of lines) {
    if (line.trim().startsWith('#')) {
      continue;
    }

    for (const pattern of blockedPatterns) {
      if (pattern.test(line)) {
        console.error(
          '\n✖ Commit rejected: AI or automated agent attribution detected in commit message.',
        );
        console.error(`  Matched line: "${line.trim()}"`);
        console.error(
          "  Rule: Commits must use the developer's own git identity. Never add Co-authored-by, Generated-with, or any AI/agent attribution.\n",
        );
        process.exit(1);
      }
    }
  }
} catch (error) {
  console.error(`Error reading commit message file: ${error.message}`);
  process.exit(1);
}
