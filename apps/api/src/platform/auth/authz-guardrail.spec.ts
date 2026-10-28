import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('isSystemAdmin Guardrail', () => {
  it('enforces that isSystemAdmin is never read for authorization decisions outside authz definition files', () => {
    const srcDir = path.resolve(__dirname, '../../..');
    const filesToScan: string[] = [];

    function findTsFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== 'dist') {
            findTsFiles(fullPath);
          }
        } else if (
          entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.spec.ts') &&
          !entry.name.endsWith('.test.ts') &&
          !entry.name.endsWith('.d.ts')
        ) {
          filesToScan.push(fullPath);
        }
      }
    }

    findTsFiles(path.join(srcDir, 'src'));

    // Allowed files where isSystemAdmin may be declared/set (informational for UI):
    // 1. request-context.ts (schema definition)
    // 2. authz.interface.ts (interface definition)
    // 3. authz.service.ts (where the boolean is populated from assignment)
    // 4. auth.service.ts (buildAuthMe returning it to frontend)
    // 5. jwt-auth.guard.ts (attaching it to request.user for UI)
    const allowedBasenames = [
      'request-context.ts',
      'authz.interface.ts',
      'authz.service.ts',
      'auth.service.ts',
      'jwt-auth.guard.ts',
    ];

    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of filesToScan) {
      const basename = path.basename(file);
      if (allowedBasenames.includes(basename)) {
        continue;
      }

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // Look for conditions checking isSystemAdmin
        if (
          line.includes('.isSystemAdmin') &&
          (line.includes('if') ||
            line.includes('?') ||
            line.includes('&&') ||
            line.includes('||') ||
            line.includes('===') ||
            line.includes('!'))
        ) {
          violations.push({
            file: path.relative(srcDir, file),
            line: i + 1,
            text: line.trim(),
          });
        }
      }
    }

    expect(
      violations,
      `isSystemAdmin must remain UI-informational only. Found conditional branching using isSystemAdmin in:\n${violations.map((v) => `  ${v.file}:${v.line} -> ${v.text}`).join('\n')}`,
    ).toHaveLength(0);
  });
});
