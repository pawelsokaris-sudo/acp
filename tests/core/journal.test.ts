import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Journal } from '../../src/core/journal.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Journal', () => {
  let tmpDir: string;
  let journal: Journal;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
    journal = new Journal(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends and reads entries', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Found a bug',
      confidence: 'high', persistence: 'project',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T10:05:00Z', session: 'sess_001',
      agent: 'cc', type: 'decision', text: 'Fix the bug',
      confidence: 'high', persistence: 'session',
    });

    const entries = await journal.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('evt_001');
    expect(entries[1].type).toBe('decision');
  });

  it('getRecent filters by persistence', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Ephemeral',
      persistence: 'ephemeral',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T10:01:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Project note',
      persistence: 'project',
    });

    const recent = await journal.getRecent(10, ['session', 'project']);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('evt_002');
  });

  it('getLastSession returns most recent session_end', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'session_end', summary: 'First done', result: 'complete',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T11:00:00Z', session: 'sess_002',
      agent: 'cursor', type: 'session_end', summary: 'Second done', result: 'partial',
    });

    const last = await journal.getLastSession();
    expect(last).not.toBeNull();
    expect(last!.agent).toBe('cursor');
    expect(last!.summary).toBe('Second done');
  });

  it('getLastSession returns null when no sessions', async () => {
    const last = await journal.getLastSession();
    expect(last).toBeNull();
  });

  it('getBlockers returns blocker entries', async () => {
    await journal.append({
      id: 'evt_001', ts: '2026-04-05T10:00:00Z', session: 'sess_001',
      agent: 'cc', type: 'blocker', text: 'DB is down', persistence: 'session',
    });
    await journal.append({
      id: 'evt_002', ts: '2026-04-05T10:05:00Z', session: 'sess_001',
      agent: 'cc', type: 'discovery', text: 'Not a blocker', persistence: 'session',
    });

    const blockers = await journal.getBlockers();
    expect(blockers).toHaveLength(1);
    expect(blockers[0].text).toBe('DB is down');
  });

  it('reads empty journal without error', async () => {
    const entries = await journal.readAll();
    expect(entries).toEqual([]);
  });
});
