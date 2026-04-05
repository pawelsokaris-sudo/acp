import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildContext } from '../../src/core/contextBuilder.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('contextBuilder', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('builds full context from empty .acp/', async () => {
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), 'frozen: []\nnever: []\nalways: []\n');
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    const ctx = await buildContext(tmpDir);
    expect(ctx.rules.frozen).toEqual([]);
    expect(ctx.rules_hash).toMatch(/^sha256:/);
    expect(ctx.memory.recent).toEqual([]);
    expect(ctx.memory.last_session).toBeNull();
    expect(ctx.memory.blockers).toEqual([]);
    expect(ctx.environment.services).toEqual([]);
  });

  it('builds context with rules and journal entries', async () => {
    fs.writeFileSync(path.join(tmpDir, 'rules.yaml'), `
frozen:
  - id: r1
    text: "Do not touch DB"
never: []
always: []
`);
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), 'services: []\nimportant_files: []\ndo_not_touch: []\n');

    const entry = JSON.stringify({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'decision', text: 'Use Express',
      persistence: 'project',
    });
    fs.writeFileSync(path.join(tmpDir, 'journal.jsonl'), entry + '\n');

    const ctx = await buildContext(tmpDir);
    expect(ctx.rules.frozen).toHaveLength(1);
    expect(ctx.memory.recent).toHaveLength(1);
    expect(ctx.memory.recent[0].text).toBe('Use Express');
  });
});
