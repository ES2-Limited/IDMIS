import { describe, it, expect } from 'vitest';
import { validateCommitMessage } from './check-commit-msg.mjs';

describe('check-commit-msg AI attribution guard', () => {
  it('allows human co-authors ("Co-authored-by: Kai Musa <kai@x.com>")', () => {
    const msg = 'feat(core): add feature\n\nCo-authored-by: Kai Musa <kai@x.com>';
    const result = validateCommitMessage(msg);
    expect(result.valid).toBe(true);
  });

  it('rejects AI agent co-authors ("Co-authored-by: Antigravity <agent@google.com>")', () => {
    const msg = 'feat(core): add feature\n\nCo-authored-by: Antigravity <agent@google.com>';
    const result = validateCommitMessage(msg);
    expect(result.valid).toBe(false);
    expect(result.matchedLine).toBe('Co-authored-by: Antigravity <agent@google.com>');
  });

  it('rejects bot co-authors ("Co-authored-by: dependabot[bot] <...>")', () => {
    const msg = 'chore(deps): bump pkg\n\nCo-authored-by: dependabot[bot] <support@github.com>';
    const result = validateCommitMessage(msg);
    expect(result.valid).toBe(false);
    expect(result.matchedLine).toBe('Co-authored-by: dependabot[bot] <support@github.com>');
  });

  it('rejects generated-by attribution ("Generated with X")', () => {
    const msg = 'feat(core): add feature\n\nGenerated with X';
    const result = validateCommitMessage(msg);
    expect(result.valid).toBe(false);
    expect(result.matchedLine).toBe('Generated with X');
  });
});
