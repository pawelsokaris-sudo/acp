import fs from 'fs';
import path from 'path';
import type { JournalEntry, LastSessionInfo, Persistence } from '../types.js';

export class Journal {
  private filePath: string;

  constructor(acpDir: string) {
    this.filePath = path.join(acpDir, 'journal.jsonl');
  }

  async append(entry: Partial<JournalEntry> & { id: string; type: string }): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await fs.promises.appendFile(this.filePath, line, 'utf-8');
  }

  async readAll(): Promise<JournalEntry[]> {
    if (!fs.existsSync(this.filePath)) return [];
    const content = await fs.promises.readFile(this.filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    const entries: JournalEntry[] = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
    return entries;
  }

  async getRecent(limit: number = 20, persistenceFilter?: Persistence[]): Promise<JournalEntry[]> {
    const all = await this.readAll();
    let filtered = all.filter(e => e.type !== 'session_start' && e.type !== 'session_end');
    if (persistenceFilter && persistenceFilter.length > 0) {
      filtered = filtered.filter(e => e.persistence && persistenceFilter.includes(e.persistence));
    }
    return filtered.slice(-limit);
  }

  async getLastSession(): Promise<LastSessionInfo | null> {
    const all = await this.readAll();
    const sessionEnds = all.filter(e => e.type === 'session_end');
    if (sessionEnds.length === 0) return null;
    const last = sessionEnds[sessionEnds.length - 1];
    return {
      agent: last.agent,
      summary: last.summary || '',
      ended_at: last.ts,
      result: last.result || 'unknown',
    };
  }

  async getBlockers(): Promise<JournalEntry[]> {
    const all = await this.readAll();
    return all.filter(e => e.type === 'blocker');
  }
}
