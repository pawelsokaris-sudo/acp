import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createApp } from '../server/index.js';

export function startCommand(opts: { port?: string }) {
  const acpDir = path.join(process.cwd(), '.acp');

  if (!fs.existsSync(acpDir)) {
    console.error('Error: .acp/ not found. Run "acp init" first.');
    process.exit(1);
  }

  let port = parseInt(opts.port || '3075', 10);
  const configPath = path.join(acpDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    try {
      const config = yaml.load(fs.readFileSync(configPath, 'utf-8')) as any;
      if (config?.port && !opts.port) {
        port = config.port;
      }
    } catch { /* use default */ }
  }

  const app = createApp(acpDir);

  app.listen(port, '127.0.0.1', () => {
    console.log(`
ACP Server v0.1.0
  http://127.0.0.1:${port}

Endpoints:
  POST /session/start   — agent joins, gets context
  POST /publish         — agent publishes discovery/decision
  POST /session/end     — agent leaves, writes summary

Data:
  Rules:       .acp/rules.yaml
  Environment: .acp/environment.yaml
  Journal:     .acp/journal.jsonl

Press Ctrl+C to stop.
`);
  });
}
