import fs from 'fs';
import path from 'path';

const RULES_TEMPLATE = `# Project rules — agents MUST respect these
# Hierarchy: frozen > never > always > memory > agent guess

frozen: []
  # - id: arch-001
  #   text: "Description of frozen architectural decision"
  #   source: ADR-001
  #   since: 2026-01-01

never: []
  # - id: sec-001
  #   text: "Never commit secrets or API keys"
  #   source: security-policy

always: []
  # - id: qa-001
  #   text: "Run tests before committing"
  #   source: CI-policy
`;

const ENVIRONMENT_TEMPLATE = `# Project environment — static description

services: []
  # - name: api
  #   host: localhost
  #   port: 8080
  #   notes: "Express.js, Node 20"

important_files: []
  # - src/index.ts
  # - prisma/schema.prisma

do_not_touch: []
  # - migrations/
  # - scripts/deploy.sh
`;

const CONFIG_TEMPLATE = `version: "0.1"
port: 3075
`;

export function initCommand() {
  const acpDir = path.join(process.cwd(), '.acp');

  if (fs.existsSync(acpDir)) {
    console.log('.acp/ already exists. Skipping init.');
    return;
  }

  fs.mkdirSync(acpDir, { recursive: true });

  fs.writeFileSync(path.join(acpDir, 'rules.yaml'), RULES_TEMPLATE);
  fs.writeFileSync(path.join(acpDir, 'environment.yaml'), ENVIRONMENT_TEMPLATE);
  fs.writeFileSync(path.join(acpDir, 'config.yaml'), CONFIG_TEMPLATE);

  console.log(`
ACP initialized in .acp/

Created:
  .acp/rules.yaml         — project rules (commit to git)
  .acp/environment.yaml   — environment description (commit to git)
  .acp/config.yaml        — ACP configuration

Next steps:
  1. Edit .acp/rules.yaml with your project rules
  2. Add ".acp/journal.jsonl" to .gitignore
  3. Run: npx acp start
`);
}
