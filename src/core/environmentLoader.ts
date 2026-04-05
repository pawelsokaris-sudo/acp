import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { Environment } from '../types.js';

const EMPTY_ENV: Environment = { services: [], important_files: [], do_not_touch: [] };

export function loadEnvironment(acpDir: string): Environment {
  const filePath = path.join(acpDir, 'environment.yaml');
  if (!fs.existsSync(filePath)) return { ...EMPTY_ENV };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;
    return {
      services: Array.isArray(parsed?.services) ? parsed.services : [],
      important_files: Array.isArray(parsed?.important_files) ? parsed.important_files : [],
      do_not_touch: Array.isArray(parsed?.do_not_touch) ? parsed.do_not_touch : [],
    };
  } catch {
    console.warn(`[ACP] Warning: could not parse ${filePath}`);
    return { ...EMPTY_ENV };
  }
}
