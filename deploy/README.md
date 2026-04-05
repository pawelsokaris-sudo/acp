# ACP Deployment — acp.actproof.io

## Setup

```bash
cd /opt/acp-server
git pull origin master
npm ci && npm run build

# Copy seed data to .acp/
cp deploy/seed/rules.yaml .acp/rules.yaml
cp deploy/seed/environment.yaml .acp/environment.yaml
cp deploy/seed/journal.jsonl .acp/journal.jsonl

# Config: bind to all interfaces for Caddy proxy
cat > .acp/config.yaml << 'EOF'
version: "0.1"
port: 3075
bind: "0.0.0.0"
EOF
```

## Environment variables

```bash
ACP_TOKEN_CC=acp_cc_Kx7mP9qR2vN:claude-code
ACP_TOKEN_ANTEK=acp_antek_Yw3hL8dF5jT:antek
ACP_TOKEN_OPUS=acp_opus_Qe6nG4sB1cM:opus
ACP_TOKEN_PAWEL=acp_pawel_Zr9tU2wX7pA:pawel
```

## Run

```bash
npx acp start
```

## Verify

```bash
curl -s http://localhost:3075/health
curl -s -H "Authorization: Bearer acp_antek_Yw3hL8dF5jT" \
  -X POST http://localhost:3075/session/start \
  -H "Content-Type: application/json" \
  -d '{"agent":{"id":"antek"},"scope":{"task":"verify"}}' | jq .
```

Should return rules (13), memory.recent (6 seed events), environment (6 services).
