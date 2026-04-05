# ACP Deployment Guide

## Setup

```bash
cd /opt/acp-server
git pull origin master
npm ci && npm run build

# Copy example seed data to .acp/ (or use your own)
cp deploy/seed.example/rules.yaml .acp/rules.yaml
cp deploy/seed.example/environment.yaml .acp/environment.yaml
cp deploy/seed.example/journal.jsonl .acp/journal.jsonl

# Config: bind to all interfaces for reverse proxy
cat > .acp/config.yaml << 'EOF'
version: "0.1"
port: 3075
bind: "0.0.0.0"
EOF
```

## Environment variables

```bash
# Agent tokens — format: ACP_TOKEN_<LABEL>=<token>:<agent_id>
ACP_TOKEN_AGENT1=<generate-random-token>:agent-name

# Panel auth (optional)
ACP_ALLOWED_EMAILS=admin@example.com
ACP_JWT_SECRET=<generate-random-secret>
ACP_SMTP_URL=http://localhost:4001/send
ACP_SMTP_FROM=noreply@example.com
```

## Run

```bash
npx acp start
```

## Verify

```bash
curl -s http://localhost:3075/health
# → {"status":"ok","version":"0.1"}
```
