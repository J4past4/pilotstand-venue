import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  authenticateBetaUser,
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  getSessionFromHeaders,
  isBetaAuthEnabled,
  parseBetaUsers,
  requireBetaSession,
  SESSION_COOKIE_NAME,
  verifyPassword,
  verifySessionToken,
} from '../../api/_lib/auth.ts';

describe('Private Beta Auth Library', () => {
  const sampleUsersJson = JSON.stringify([
    {
      email: 'founder@zukistudio.co.uk',
      name: 'Founder',
      role: 'admin',
      password: 'FounderSecretPassword!1',
    },
    {
      email: 'marketer@company.com',
      name: 'Alex Marketing',
      role: 'beta',
      password: 'MarketerBetaPassword!2',
    },
  ]);

  const envWithUsers: NodeJS.ProcessEnv = {
    BETA_USERS: sampleUsersJson,
    AUTH_SESSION_SECRET: 'test-super-secret-key-32-chars-minimum',
  };

  it('parses JSON array and comma-separated shorthand formats cleanly', () => {
    const jsonUsers = parseBetaUsers(sampleUsersJson);
    expect(jsonUsers).toHaveLength(2);
    expect(jsonUsers[0]).toMatchObject({
      email: 'founder@zukistudio.co.uk',
      name: 'Founder',
      role: 'admin',
    });
    expect(jsonUsers[1]).toMatchObject({
      email: 'marketer@company.com',
      name: 'Alex Marketing',
      role: 'beta',
    });

    const shorthand = parseBetaUsers(
      'Founder@Company.com:pass1:James:admin,marketer@company.com:pass2:Alex'
    );
    expect(shorthand).toHaveLength(2);
    expect(shorthand[0].email).toBe('founder@company.com');
    expect(shorthand[0].role).toBe('admin');
    expect(shorthand[1].email).toBe('marketer@company.com');
    expect(shorthand[1].name).toBe('Alex');
    expect(shorthand[1].role).toBe('beta');
  });

  it('supports salted scrypt password hashes as well as plain passwords', () => {
    const salt = 'somesalt1234';
    const derivedHex = scryptSync('MyStrongBetaPass!', salt, 32).toString('hex');
    const hashed = `scrypt:${salt}:${derivedHex}`;

    expect(verifyPassword('MyStrongBetaPass!', hashed)).toBe(true);
    expect(verifyPassword('WrongPass', hashed)).toBe(false);
    expect(verifyPassword('PlainPass', 'PlainPass')).toBe(true);
    expect(verifyPassword('plainpass', 'PlainPass')).toBe(false);
  });

  it('authenticates each user independently (case-insensitive email) and rejects wrong credentials', () => {
    const marketer = authenticateBetaUser(
      'MARKETER@Company.com',
      'MarketerBetaPassword!2',
      envWithUsers
    );
    expect(marketer).toEqual({
      email: 'marketer@company.com',
      name: 'Alex Marketing',
      role: 'beta',
    });

    expect(
      authenticateBetaUser('marketer@company.com', 'FounderSecretPassword!1', envWithUsers)
    ).toBeNull();
    expect(authenticateBetaUser('unknown@company.com', 'anything', envWithUsers)).toBeNull();
  });

  it('issues signed session tokens that reject tampering, expiry, and revoked users', () => {
    const user = { email: 'marketer@company.com', name: 'Alex Marketing', role: 'beta' as const };
    const now = 1_700_000_000;
    const token = createSessionToken(user, envWithUsers, now);

    expect(verifySessionToken(token, envWithUsers, now + 60)).toEqual(user);

    // Tampered token fails
    const tampered = `${token.slice(0, -4)}XXXX`;
    expect(verifySessionToken(tampered, envWithUsers, now + 60)).toBeNull();

    // Expired token fails (8 days later)
    expect(verifySessionToken(token, envWithUsers, now + 8 * 86_400)).toBeNull();

    // Removing the user from BETA_USERS revokes their existing session immediately
    const revokedEnv: NodeJS.ProcessEnv = {
      ...envWithUsers,
      BETA_USERS: JSON.stringify([
        {
          email: 'founder@zukistudio.co.uk',
          name: 'Founder',
          role: 'admin',
          password: 'FounderSecretPassword!1',
        },
      ]),
    };
    expect(verifySessionToken(token, revokedEnv, now + 60)).toBeNull();
  });

  it('serializes secure HttpOnly cookies and enforces requireBetaSession when BETA_USERS is set', () => {
    expect(isBetaAuthEnabled({})).toBe(false);
    expect(requireBetaSession({}, {})).toEqual({ authorized: true, user: null });

    expect(isBetaAuthEnabled(envWithUsers)).toBe(true);
    expect(requireBetaSession({}, envWithUsers)).toEqual({ authorized: false, user: null });

    const user = { email: 'marketer@company.com', name: 'Alex Marketing', role: 'beta' as const };
    const token = createSessionToken(user, envWithUsers);
    const cookieHeader = buildSessionCookie(token, true);
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Lax');
    expect(cookieHeader).toContain('Secure');

    const parsed = getSessionFromHeaders(
      { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
      envWithUsers
    );
    expect(parsed).toEqual(user);

    const authCheck = requireBetaSession(
      { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
      envWithUsers
    );
    expect(authCheck).toEqual({ authorized: true, user });

    expect(buildClearSessionCookie(true)).toContain('Max-Age=0');
  });
});
