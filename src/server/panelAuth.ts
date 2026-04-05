import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

interface TokenEntry {
  email: string;
  expires: number;
}

export function panelAuthRouter(): Router {
  const router = Router();
  const tokenStore = new Map<string, TokenEntry>();
  let lastToken: string | null = null;

  // Cleanup expired tokens periodically
  function cleanExpired() {
    const now = Date.now();
    for (const [token, entry] of tokenStore) {
      if (entry.expires < now) tokenStore.delete(token);
    }
  }

  router.post('/panel/auth/request', async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Missing email' });
      return;
    }

    const allowedRaw = process.env.ACP_ALLOWED_EMAILS || '';
    const allowed = allowedRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    if (!allowed.includes(email.toLowerCase())) {
      res.status(403).json({ error: 'Email not allowed' });
      return;
    }

    cleanExpired();

    const token = crypto.randomBytes(32).toString('hex');
    tokenStore.set(token, {
      email: email.toLowerCase(),
      expires: Date.now() + 15 * 60 * 1000, // 15 min
    });
    lastToken = token;

    // Optionally send email via ACP_SMTP_URL
    const smtpUrl = process.env.ACP_SMTP_URL;
    if (smtpUrl) {
      try {
        const verifyUrl = `${req.protocol}://${req.get('host')}/panel/auth/verify?token=${token}`;
        await fetch(smtpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: 'ACP Panel — Login Link',
            bodyHtml: `<p>Click to log in: <a href="${verifyUrl}">${verifyUrl}</a></p><p>Valid for 15 minutes.</p>`,
          }),
        });
      } catch {
        // SMTP failure is non-blocking
      }
    }

    res.json({ ok: true });
  });

  router.get('/panel/auth/verify', async (req, res) => {
    const token = req.query.token as string | undefined;
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    const entry = tokenStore.get(token);
    if (!entry || entry.expires < Date.now()) {
      tokenStore.delete(token!);
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
    }

    // Consume token (one-time use)
    tokenStore.delete(token);

    const jwtSecret = process.env.ACP_JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ error: 'ACP_JWT_SECRET not configured' });
      return;
    }

    const jwtToken = jwt.sign({ email: entry.email, type: 'panel' }, jwtSecret, { expiresIn: '24h' });

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieFlags = [
      `acp_session=${jwtToken}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${24 * 60 * 60}`,
    ];
    if (isProduction) cookieFlags.push('Secure');

    res.setHeader('Set-Cookie', cookieFlags.join('; '));
    res.redirect(302, '/panel/');
  });

  // Test helper — only available outside production
  router.get('/panel/auth/_test_last_token', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ token: lastToken });
  });

  return router;
}
