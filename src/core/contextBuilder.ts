import { loadRules, hashRules } from './rulesLoader.js';
import { loadEnvironment } from './environmentLoader.js';
import { Journal } from './journal.js';
import type { Rules, Environment, JournalEntry, LastSessionInfo } from '../types.js';

export interface BuiltContext {
  rules: Rules;
  rules_hash: string;
  memory: {
    recent: JournalEntry[];
    blockers: JournalEntry[];
    last_session: LastSessionInfo | null;
  };
  environment: Environment;
}

export async function buildContext(acpDir: string): Promise<BuiltContext> {
  const rules = loadRules(acpDir);
  const rules_hash = hashRules(rules);
  const environment = loadEnvironment(acpDir);
  const journal = new Journal(acpDir);

  const recent = await journal.getRecent(20, ['session', 'project']);
  const blockers = await journal.getBlockers();
  const last_session = await journal.getLastSession();

  return {
    rules,
    rules_hash,
    memory: { recent, blockers, last_session },
    environment,
  };
}
