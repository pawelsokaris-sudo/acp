// === Rules ===

export interface Rule {
  id: string;
  text: string;
  source?: string;
  since?: string;
}

export interface Rules {
  frozen: Rule[];
  never: Rule[];
  always: Rule[];
}

// === Journal ===

export type EntryType =
  | 'session_start'
  | 'discovery'
  | 'decision'
  | 'blocker'
  | 'warning'
  | 'result'
  | 'handoff'
  | 'session_end';

export type Confidence = 'high' | 'medium' | 'low';
export type Persistence = 'ephemeral' | 'session' | 'project';
export type SessionResult = 'complete' | 'partial' | 'blocked' | 'failed';

export interface JournalEntry {
  id: string;
  ts: string;
  session: string;
  agent: string;
  type: EntryType;
  text?: string;
  confidence?: Confidence;
  persistence?: Persistence;
  tags?: string[];
  scope?: { task?: string; repo?: string };
  intent?: string;
  summary?: string;
  files_changed?: string[];
  decisions_made?: string[];
  open_threads?: string[];
  result?: SessionResult;
}

// === Environment ===

export interface ServiceInfo {
  name: string;
  host: string;
  port: number;
  notes?: string;
}

export interface Environment {
  services: ServiceInfo[];
  important_files: string[];
  do_not_touch: string[];
}

// === Session (in-memory) ===

export interface ActiveSession {
  session_id: string;
  agent: string;
  scope?: { task?: string; repo?: string };
  started_at: string;
}

// === API Request/Response ===

export interface SessionStartRequest {
  agent: { id: string; kind?: string };
  scope?: { task?: string; repo?: string };
  intent?: { summary?: string };
}

export interface PublishRequest {
  session_id: string;
  type: Exclude<EntryType, 'session_start' | 'session_end'>;
  text: string;
  confidence?: Confidence;
  persistence?: Persistence;
  tags?: string[];
}

export interface SessionEndRequest {
  session_id: string;
  summary: string;
  files_changed?: string[];
  decisions_made?: string[];
  open_threads?: string[];
  result: SessionResult;
}

export interface LastSessionInfo {
  agent: string;
  summary: string;
  ended_at: string;
  result: string;
}

export interface SessionStartResponse {
  session: {
    session_id: string;
    started_at: string;
    rules_hash: string;
  };
  rules: Rules;
  memory: {
    recent: JournalEntry[];
    blockers: JournalEntry[];
    last_session: LastSessionInfo | null;
  };
  environment: Environment;
}
