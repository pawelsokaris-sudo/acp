import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const agentId = tokenMap.get(token);

      if (agentId) {
        (req as any).authenticatedAgent = agentId;
        next();
        return;
      }

      // Bearer token provided but invalid
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    // JWT cookie fallback (panel auth)
    const jwtSecret = process.env.ACP_JWT_SECRET;
    if (jwtSecret && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').map(c => c.trim());
      const sessionCookie = cookies.find(c => c.startsWith('acp_session='));
      if (sessionCookie) {
        const jwtToken = sessionCookie.substring('acp_session='.length);
        try {
          const payload = jwt.verify(jwtToken, jwtSecret) as { email?: string; type?: string };
          if (payload.type === 'panel' && payload.email) {
            (req as any).authenticatedAgent = 'panel:' + payload.email;
            next();
            return;
          }
        } catch {
          // Invalid JWT, fall through to 401
        }
      }
    }

    res.status(401).json({ error: 'Missing or invalid Authorization header. Expected: Bearer <token>' });
    return;
  };
}
