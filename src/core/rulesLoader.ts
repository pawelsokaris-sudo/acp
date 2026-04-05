import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';
import type { Rules } from '../types.js';

const EMPTY_RULES: Rules = { frozen: [], never: [], always: [] };

export function loadRules(acpDir: string): Rules {
  const filePath = path.join(acpDir, 'rules.yaml');
  if (!fs.existsSync(filePath)) return { ...EMPTY_RULES };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;
    return {
      frozen: Array.isArray(parsed?.frozen) ? parsed.frozen : [],
      never: Array.isArray(parsed?.never) ? parsed.never : [],
      always: Array.isArray(parsed?.always) ? parsed.always : [],
    };
  } catch {
    console.warn(`[ACP] Warning: could not parse ${filePath}`);
    return { ...EMPTY_RULES };
  }
}

export function hashRules(rules: Rules): string {
  const content = JSON.stringify(rules);
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}
