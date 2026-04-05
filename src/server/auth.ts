import type { Request, Response, NextFunction } from 'express';

export interface AgentToken {
  token: string;
  agent_id: string;
}

/**
 * Parse agent tokens from environment variables.
 * Format: ACP_TOKEN_<LABEL>=<token>:<agent_id>
 * Example: ACP_TOKEN_CC=acp_cc_Kx7mP9qR2vN:claude-code
 *
 * If no ACP_TOKEN_* vars are set, auth is disabled (localhost dev mode).
 */
export function loadTokens(): Map<string, string> {
  const tokenMap = new Map<string, string>(); // token → agent_id

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('ACP_TOKEN_') && value) {
      const colonIdx = value.indexOf(':');
      if (colonIdx === -1) continue;
      const token = value.substring(0, colonIdx);
      const agentId = value.substring(colonIdx + 1);
      if (token && agentId) {
        tokenMap.set(token, agentId);
      }
    }
  }

  return tokenMap;
}

/**
 * Express middleware for Bearer token auth.
 * If no tokens configured → passthrough (dev mode).
 * If tokens configured → require valid Bearer token.
 */
export function authMiddleware(tokenMap: Map<string, string>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // No tokens configured = dev mode, skip auth
    if (tokenMap.size === 0) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header. Expected: Bearer <token>' });
      return;
    }

    const token = authHeader.substring(7);
    const agentId = tokenMap.get(token);

    if (!agentId) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    // Attach authenticated agent_id to request for downstream use
    (req as any).authenticatedAgent = agentId;
    next();
  };
}
