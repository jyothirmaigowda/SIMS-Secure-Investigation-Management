import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db.ts';
import { logAuditEvent } from '../audit.ts';
import {
  createSession,
  requireAuth,
  SESSION_COOKIE_NAME,
  extractToken,
  validateSession,
} from '../auth.ts';

const router = Router();

/* =========================================================
   CAPTCHA
   ========================================================= */

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface CaptchaChallenge {
  answerHash: string;
  expiresAt: number;
}

const captchaChallenges = new Map<string, CaptchaChallenge>();

/**
 * Remove expired CAPTCHA challenges periodically.
 */
setInterval(() => {
  const now = Date.now();

  for (const [challengeId, challenge] of captchaChallenges.entries()) {
    if (challenge.expiresAt <= now) {
      captchaChallenges.delete(challengeId);
    }
  }
}, 60 * 1000).unref();

/**
 * Generate a random CAPTCHA answer.
 */
function generateCaptchaAnswer(length = 5): string {
  let answer = '';

  for (let i = 0; i < length; i++) {
    const index = crypto.randomInt(0, CAPTCHA_ALPHABET.length);
    answer += CAPTCHA_ALPHABET[index];
  }

  return answer;
}

/**
 * Hash CAPTCHA answer using SHA-256.
 */
function hashCaptchaAnswer(answer: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(answer.trim().toUpperCase(), 'utf8')
    .digest();
}

/**
 * Constant-time CAPTCHA comparison.
 */
function captchaMatches(
  providedAnswer: string,
  expectedHash: string
): boolean {
  try {
    const providedHash = hashCaptchaAnswer(providedAnswer);

    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    if (providedHash.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedHash, expectedBuffer);
  } catch {
    return false;
  }
}

/* =========================================================
   CAPTCHA GLYPHS
   ========================================================= */

const CAPTCHA_GLYPHS: Record<string, string[]> = {
  A: [
    '01110',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001',
  ],
  B: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10001',
    '10001',
    '11110',
  ],
  C: [
    '01111',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '01111',
  ],
  D: [
    '11110',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '11110',
  ],
  E: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '11111',
  ],
  F: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '10000',
  ],
  G: [
    '01111',
    '10000',
    '10000',
    '10111',
    '10001',
    '10001',
    '01111',
  ],
  H: [
    '10001',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001',
  ],
  J: [
    '00111',
    '00010',
    '00010',
    '00010',
    '10010',
    '10010',
    '01100',
  ],
  K: [
    '10001',
    '10010',
    '10100',
    '11000',
    '10100',
    '10010',
    '10001',
  ],
  L: [
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '11111',
  ],
  M: [
    '10001',
    '11011',
    '10101',
    '10101',
    '10001',
    '10001',
    '10001',
  ],
  N: [
    '10001',
    '11001',
    '10101',
    '10011',
    '10001',
    '10001',
    '10001',
  ],
  P: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10000',
    '10000',
    '10000',
  ],
  Q: [
    '01110',
    '10001',
    '10001',
    '10001',
    '10101',
    '10010',
    '01101',
  ],
  R: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10100',
    '10010',
    '10001',
  ],
  S: [
    '01111',
    '10000',
    '10000',
    '01110',
    '00001',
    '00001',
    '11110',
  ],
  T: [
    '11111',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100',
  ],
  U: [
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01110',
  ],
  V: [
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01010',
    '00100',
  ],
  W: [
    '10001',
    '10001',
    '10001',
    '10101',
    '10101',
    '11011',
    '10001',
  ],
  X: [
    '10001',
    '10001',
    '01010',
    '00100',
    '01010',
    '10001',
    '10001',
  ],
  Y: [
    '10001',
    '10001',
    '01010',
    '00100',
    '00100',
    '00100',
    '00100',
  ],
  Z: [
    '11111',
    '00001',
    '00010',
    '00100',
    '01000',
    '10000',
    '11111',
  ],

  '2': [
    '01110',
    '10001',
    '00001',
    '00010',
    '00100',
    '01000',
    '11111',
  ],
  '3': [
    '11110',
    '00001',
    '00001',
    '01110',
    '00001',
    '00001',
    '11110',
  ],
  '4': [
    '00010',
    '00110',
    '01010',
    '10010',
    '11111',
    '00010',
    '00010',
  ],
  '5': [
    '11111',
    '10000',
    '10000',
    '11110',
    '00001',
    '00001',
    '11110',
  ],
  '6': [
    '01110',
    '10000',
    '10000',
    '11110',
    '10001',
    '10001',
    '01110',
  ],
  '7': [
    '11111',
    '00001',
    '00010',
    '00100',
    '01000',
    '01000',
    '01000',
  ],
  '8': [
    '01110',
    '10001',
    '10001',
    '01110',
    '10001',
    '10001',
    '01110',
  ],
  '9': [
    '01110',
    '10001',
    '10001',
    '01111',
    '00001',
    '00001',
    '01110',
  ],
};

/**
 * Escape XML/SVG special characters.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create CAPTCHA SVG.
 *
 * We deliberately render characters as bitmap rectangles instead
 * of SVG <text>, so the browser always displays the CAPTCHA
 * consistently without depending on installed fonts.
 */
function renderCaptchaSvg(answer: string): string {
  const width = 220;
  const height = 72;

  const background = '#0f172a';
  const foreground = '#f8fafc';

  const glyphWidth = 5;
  const glyphHeight = 7;
  const pixelSize = 6;

  const totalGlyphWidth = glyphWidth * pixelSize;
  const gap = 9;

  const contentWidth =
    answer.length * totalGlyphWidth +
    (answer.length - 1) * gap;

  const startX = Math.floor((width - contentWidth) / 2);
  const startY = 15;

  let rectangles = '';

  for (let charIndex = 0; charIndex < answer.length; charIndex++) {
    const char = answer[charIndex];
    const glyph = CAPTCHA_GLYPHS[char];

    if (!glyph) {
      continue;
    }

    const glyphX =
      startX + charIndex * (totalGlyphWidth + gap);

    for (
      let row = 0;
      row < glyph.length && row < glyphHeight;
      row++
    ) {
      const rowData = glyph[row];

      for (let col = 0; col < rowData.length; col++) {
        if (rowData[col] !== '1') {
          continue;
        }

        const x = glyphX + col * pixelSize;
        const y = startY + row * pixelSize;

        rectangles += `
          <rect
            x="${x}"
            y="${y}"
            width="${pixelSize - 1}"
            height="${pixelSize - 1}"
            rx="1"
            fill="${foreground}"
          />
        `;
      }
    }
  }

  let noiseLines = '';

  for (let i = 0; i < 7; i++) {
    const x1 = crypto.randomInt(0, width);
    const y1 = crypto.randomInt(0, height);
    const x2 = crypto.randomInt(0, width);
    const y2 = crypto.randomInt(0, height);

    noiseLines += `
      <line
        x1="${x1}"
        y1="${y1}"
        x2="${x2}"
        y2="${y2}"
        stroke="#475569"
        stroke-width="1"
        opacity="0.65"
      />
    `;
  }

  let noiseDots = '';

  for (let i = 0; i < 35; i++) {
    const cx = crypto.randomInt(4, width - 4);
    const cy = crypto.randomInt(4, height - 4);

    noiseDots += `
      <circle
        cx="${cx}"
        cy="${cy}"
        r="1"
        fill="#94a3b8"
        opacity="0.45"
      />
    `;
  }

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Security CAPTCHA"
    >
      <rect
        width="${width}"
        height="${height}"
        rx="8"
        fill="${background}"
      />

      ${noiseLines}
      ${noiseDots}
      ${rectangles}

      <rect
        x="1"
        y="1"
        width="${width - 2}"
        height="${height - 2}"
        rx="8"
        fill="none"
        stroke="#334155"
        stroke-width="2"
      />
    </svg>
  `.trim();
}

/**
 * GET /api/auth/captcha
 *
 * Creates a fresh server-side CAPTCHA challenge.
 */
router.get('/captcha', async (_req: Request, res: Response) => {
  try {
    const answer = generateCaptchaAnswer(5);

    const challengeId = crypto.randomBytes(24).toString('hex');

    const answerHash = hashCaptchaAnswer(answer).toString('hex');

    captchaChallenges.set(challengeId, {
      answerHash,
      expiresAt: Date.now() + CAPTCHA_TTL_MS,
    });

    const image = renderCaptchaSvg(answer);

    res.set({
      'Cache-Control':
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    return res.json({
      success: true,
      challengeId,
      image: `data:image/svg+xml;base64,${Buffer.from(
        image,
        'utf8'
      ).toString('base64')}`,
      expiresInSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
    });
  } catch (error) {
    console.error('CAPTCHA generation error:', error);

    return res.status(500).json({
      success: false,
      error: 'CAPTCHA_GENERATION_FAILED',
      message: 'Unable to generate security challenge.',
    });
  }
});

/* =========================================================
   LOGIN
   ========================================================= */

const LoginSchema = z.object({
  username: z.string().trim().min(2),
  password: z.string().min(4),

  role: z.enum([
    'IO',
    'SUPERVISOR',
    'LEGAL',
    'ADMIN',
  ]),

  captchaChallenge: z.string().min(16),

  captchaAnswer: z
    .string()
    .trim()
    .min(1)
    .max(20),
});

/**
 * POST /api/auth/login
 *
 * Security order:
 *
 * 1. Validate request structure
 * 2. Validate CAPTCHA
 * 3. Find account
 * 4. Check account status
 * 5. Check lockout
 * 6. Verify selected role
 * 7. Verify password
 * 8. Reset failed attempts
 * 9. Create secure session
 * 10. Audit success
 */
router.post('/login', async (req: Request, res: Response) => {
  const ip =
    req.ip ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  const userAgent =
    req.headers['user-agent'] ||
    'unknown';

  const parseResult = LoginSchema.safeParse(req.body);

  if (!parseResult.success) {
    await logAuditEvent({
      userId: null,
      action: 'AUTH_LOGIN_REJECTED',
      targetType: 'AUTHENTICATION',
      targetId: null,
      ipAddress: ip,
      details: {
        reason: 'INVALID_REQUEST_FORMAT',
        fields: parseResult.error.issues.map(
          issue => issue.path.join('.')
        ),
      },
      status: 'SECURITY_ALERT',
    });

    return res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid username or security credentials.',
    });
  }

  const {
    username,
    password,
    role,
    captchaChallenge,
    captchaAnswer,
  } = parseResult.data;

  /*
   * ---------------------------------------------------------
   * CAPTCHA VALIDATION
   * ---------------------------------------------------------
   */

  const captcha = captchaChallenges.get(
    captchaChallenge
  );

  /*
   * CAPTCHA challenges are one-time-use.
   * Delete immediately so replay attacks cannot reuse them.
   */
  captchaChallenges.delete(captchaChallenge);

  if (!captcha) {
    await logAuditEvent({
      userId: null,
      action: 'AUTH_CAPTCHA_FAILED',
      targetType: 'AUTHENTICATION',
      targetId: username,
      ipAddress: ip,
      details: {
        reason: 'CAPTCHA_NOT_FOUND_OR_ALREADY_USED',
      },
      status: 'SECURITY_ALERT',
    });

    return res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid username or security credentials.',
    });
  }

  if (captcha.expiresAt <= Date.now()) {
    await logAuditEvent({
      userId: null,
      action: 'AUTH_CAPTCHA_FAILED',
      targetType: 'AUTHENTICATION',
      targetId: username,
      ipAddress: ip,
      details: {
        reason: 'CAPTCHA_EXPIRED',
      },
      status: 'SECURITY_ALERT',
    });

    return res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid username or security credentials.',
    });
  }

  /*
   * IMPORTANT:
   * CAPTCHA comparison is case-insensitive.
   *
   * This prevents users from getting rejected just because
   * they typed "a7k2p" instead of "A7K2P".
   */
  const captchaValid = captchaMatches(
    captchaAnswer.toUpperCase(),
    captcha.answerHash
  );

  if (!captchaValid) {
    await logAuditEvent({
      userId: null,
      action: 'AUTH_CAPTCHA_FAILED',
      targetType: 'AUTHENTICATION',
      targetId: username,
      ipAddress: ip,
      details: {
        reason: 'CAPTCHA_MISMATCH',
      },
      status: 'SECURITY_ALERT',
    });

    return res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid username or security credentials.',
    });
  }

  /*
   * ---------------------------------------------------------
   * ACCOUNT LOOKUP
   * ---------------------------------------------------------
   */

  try {
    const normalizedUsername =
      username.toLowerCase().trim();

    const userRes = await db.query(
      `
        SELECT *
        FROM users
        WHERE LOWER(username) = $1
           OR LOWER(email) = $1
        LIMIT 1
      `,
      [normalizedUsername]
    );

    if (userRes.rows.length === 0) {
      await logAuditEvent({
        userId: null,
        action: 'AUTH_LOGIN_FAILED',
        targetType: 'USER_ACCOUNT',
        targetId: username,
        ipAddress: ip,
        details: {
          attemptedUser: username,
          reason: 'ACCOUNT_NOT_FOUND',
          role,
        },
        status: 'SECURITY_ALERT',
      });

      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message:
          'Invalid username or security credentials.',
      });
    }

    const user = userRes.rows[0] as any;

    /*
     * ---------------------------------------------------------
     * ACCOUNT STATUS
     * ---------------------------------------------------------
     */

    if (!user.is_active) {
      await logAuditEvent({
        userId: user.id,
        action: 'AUTH_LOGIN_DENIED',
        targetType: 'USER_ACCOUNT',
        targetId: user.id,
        ipAddress: ip,
        details: {
          reason: 'ACCOUNT_SUSPENDED',
          username: user.username,
        },
        status: 'DENIED',
      });

      return res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message:
          'This institutional account is suspended.',
      });
    }

    /*
     * ---------------------------------------------------------
     * LOCKOUT
     * ---------------------------------------------------------
     */

    if (
      user.locked_until &&
      new Date(user.locked_until).getTime() >
        Date.now()
    ) {
      const remainingMinutes = Math.ceil(
        (
          new Date(user.locked_until).getTime() -
          Date.now()
        ) /
          (1000 * 60)
      );

      await logAuditEvent({
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        targetType: 'USER_ACCOUNT',
        targetId: user.id,
        ipAddress: ip,
        details: {
          reason: 'ACCOUNT_LOCKED',
          remainingMinutes,
        },
        status: 'DENIED',
      });

      return res.status(429).json({
        error: 'ACCOUNT_LOCKED',
        message:
          `Account temporarily locked due to excessive failed attempts. ` +
          `Try again in ${remainingMinutes} minute(s).`,
      });
    }

    /*
     * ---------------------------------------------------------
     * ROLE CHECK
     * ---------------------------------------------------------
     */

    if (user.role !== role) {
      await logAuditEvent({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        targetType: 'USER_ACCOUNT',
        targetId: user.id,
        ipAddress: ip,
        details: {
          attemptedUser: username,
          reason: 'ROLE_MISMATCH',
          selectedRole: role,
          accountRole: user.role,
        },
        status: 'SECURITY_ALERT',
      });

      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message:
          'Invalid username or security credentials.',
      });
    }

    /*
     * ---------------------------------------------------------
     * PASSWORD
     * ---------------------------------------------------------
     */

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password_hash
      );

    if (!passwordMatch) {
      const newFailedCount =
        (user.failed_attempts || 0) + 1;

      let lockedUntil: string | null = null;

      if (newFailedCount >= 5) {
        lockedUntil =
          new Date(
            Date.now() +
              15 * 60 * 1000
          ).toISOString();
      }

      await db.query(
        `
          UPDATE users
          SET
            failed_attempts = $1,
            locked_until = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `,
        [
          newFailedCount,
          lockedUntil,
          user.id,
        ]
      );

      await logAuditEvent({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        targetType: 'USER_ACCOUNT',
        targetId: user.id,
        ipAddress: ip,
        details: {
          attemptedUser: username,
          reason: 'PASSWORD_MISMATCH',
          failedCount: newFailedCount,
          locked: Boolean(lockedUntil),
        },
        status: 'SECURITY_ALERT',
      });

      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message:
          'Invalid username or security credentials.',
        attemptsRemaining: Math.max(
          0,
          5 - newFailedCount
        ),
      });
    }

    /*
     * ---------------------------------------------------------
     * SUCCESS — RESET LOCKOUT COUNTERS
     * ---------------------------------------------------------
     */

    await db.query(
      `
        UPDATE users
        SET
          failed_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [user.id]
    );

    /*
     * ---------------------------------------------------------
     * CREATE SESSION
     * ---------------------------------------------------------
     */

    const sessionToken =
      await createSession(
        user.id,
        ip,
        userAgent
      );

    const isHttps =
      req.secure ||
      req.headers['x-forwarded-proto'] ===
        'https';

    /*
     * Secure httpOnly session cookie.
     */
    res.cookie(
      SESSION_COOKIE_NAME,
      sessionToken,
      {
        httpOnly: true,

        secure:
          isHttps ||
          process.env.NODE_ENV ===
            'production',

        sameSite: isHttps
          ? 'none'
          : 'lax',

        path: '/',

        maxAge:
          12 * 60 * 60 * 1000,
      }
    );

    /*
     * ---------------------------------------------------------
     * SUCCESS AUDIT
     * ---------------------------------------------------------
     */

    await logAuditEvent({
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      targetType: 'SESSION',
      targetId:
        sessionToken.substring(0, 16) +
        '...',
      ipAddress: ip,
      details: {
        role: user.role,
        badge: user.badge_number,
        jurisdiction:
          user.jurisdiction,
      },
      status: 'SUCCESS',
    });

    /*
     * ---------------------------------------------------------
     * RESPONSE
     * ---------------------------------------------------------
     */

    return res.json({
      success: true,

      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        jurisdiction:
          user.jurisdiction,
        badge_number:
          user.badge_number,
      },
    });
  } catch (err: any) {
    console.error(
      'Login error:',
      err
    );

    await logAuditEvent({
      userId: null,
      action: 'AUTH_LOGIN_ERROR',
      targetType: 'AUTHENTICATION',
      targetId: username,
      ipAddress: ip,
      details: {
        reason:
          'INTERNAL_SERVER_ERROR',
        error:
          err?.message ||
          'Unknown authentication error',
      },
      status: 'SECURITY_ALERT',
    });

    return res.status(500).json({
      error:
        'INTERNAL_SERVER_ERROR',
      message:
        'Authentication service temporarily unavailable.',
    });
  }
});

/* =========================================================
   LOGOUT
   ========================================================= */

router.post(
  '/logout',
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const token =
        extractToken(req) ||
        req.cookies?.[
          SESSION_COOKIE_NAME
        ];

      if (token) {
        await db.query(
          'DELETE FROM sessions WHERE id = $1',
          [token]
        );
      }

      res.clearCookie(
        SESSION_COOKIE_NAME,
        {
          path: '/',
        }
      );

      return res.json({
        success: true,
        message:
          'Institutional session terminated.',
      });
    } catch (error) {
      console.error(
        'Logout error:',
        error
      );

      return res.status(500).json({
        error:
          'LOGOUT_FAILED',
        message:
          'Unable to terminate session.',
      });
    }
  }
);

/* =========================================================
   CURRENT USER
   ========================================================= */

router.get(
  '/me',
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const token =
        extractToken(req) ||
        req.cookies?.[
          SESSION_COOKIE_NAME
        ];

      if (!token) {
        return res.json({
          user: null,
        });
      }

      const user =
        await validateSession(token);

      if (user) {
        return res.json({
          user,
        });
      }

      return res.json({
        user: null,
      });
    } catch (error) {
      console.error(
        'Session validation error:',
        error
      );

      return res.json({
        user: null,
      });
    }
  }
);

/* =========================================================
   DEMO USERS
   ========================================================= */

router.get(
  '/demo-users',
  requireAuth,
  async (
    _req: Request,
    res: Response
  ) => {
    try {
      const usersRes =
        await db.query(
          `
            SELECT
              id,
              username,
              email,
              full_name,
              role,
              jurisdiction,
              badge_number
            FROM users
            ORDER BY role ASC
          `
        );

      return res.json({
        users: usersRes.rows,
      });
    } catch (error) {
      console.error(
        'Demo users error:',
        error
      );

      return res.status(500).json({
        error:
          'DEMO_USERS_UNAVAILABLE',
      });
    }
  }
);

export default router;
