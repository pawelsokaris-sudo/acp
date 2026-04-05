import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRules, hashRules } from '../../src/core/rulesLoader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('rulesLoader', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('parses valid rules.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), `
frozen:
  - id: arch-001
    text: "API gateway is the entry point"
    source: ADR-003
    since: "2026-01-15"
never:
  - id: sec-001
    text: "Never commit secrets"
always:
  - id: qa-001
    text: "Run tests before commit"
`);
    const rules = loadRules(tmpDir);
    expect(rules.frozen).toHaveLength(1);
    expect(rules.frozen[0].id).toBe('arch-001');
    expect(rules.never).toHaveLength(1);
    expect(rules.always).toHaveLength(1);
  });

  it('returns empty rules when file missing', () => {
    const rules = loadRules(tmpDir);
    expect(rules.frozen).toEqual([]);
    expect(rules.never).toEqual([]);
    expect(rules.always).toEqual([]);
  });

  it('returns empty rules on invalid YAML', () => {
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), ': : invalid {{');
    const rules = loadRules(tmpDir);
    expect(rules.frozen).toEqual([]);
  });

  it('hashRules produces consistent hash', () => {
    const rules = { frozen: [{ id: 'a', text: 'b' }], never: [], always: [] };
    const h1 = hashRules(rules);
    const h2 = hashRules(rules);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^sha256:/);
  });
});
