import { scryptSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  authenticateBetaUser,
  authenticateBetaUserAsync,
  authenticatePasscode,
  buildClearSessionCookie,
  buildSessionCookie,
  checkLoginRateLimit,
  clearInMemoryRegisteredUsers,
  clearLoginFailures,
  createSessionToken,
  getSessionFromHeaders,
  hashPassword,
  isBetaAuthEnabled,
  isBetaSignupEnabled,
  isPasscodeMode,
  parseBetaUsers,
  recordLoginFailure,
  registerBetaUser,
  requireBetaSession,
  SESSION_COOKIE_NAME,
  verifyPassword,
  verifySessionToken,
} from '../../api/_lib/auth.ts';

describe('Private Beta Auth Library', () => {
  beforeEach(() => {
    clearInMemoryRegisteredUsers();
  });

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

    const autoHashed = hashPassword('BrandNewPassword!9');
    expect(autoHashed.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword('BrandNewPassword!9', autoHashed)).toBe(true);
    expect(verifyPassword('NotIt', autoHashed)).toBe(false);
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

  it('supports invite-only self-signup, domain allowlists, duplicate protection, and login afterwards', async () => {
    const signupEnv: NodeJS.ProcessEnv = {
      BETA_INVITE_CODE: 'ZUKI-BETA-2026',
      BETA_ALLOWED_DOMAINS: 'company.com',
      AUTH_SESSION_SECRET: 'test-super-secret-key-32-chars-minimum',
    };

    expect(isBetaSignupEnabled(signupEnv)).toBe(true);
    expect(isBetaAuthEnabled(signupEnv)).toBe(true);

    // Wrong invite code rejected
    const badCode = await registerBetaUser(
      {
        name: 'Alex Marketing',
        email: 'alex@company.com',
        password: 'MyStrongPassword!1',
        inviteCode: 'WRONG-CODE',
      },
      signupEnv
    );
    expect(badCode).toMatchObject({ ok: false, status: 403 });

    // Non-allowed domain rejected
    const badDomain = await registerBetaUser(
      {
        name: 'Outsider',
        email: 'stranger@other.org',
        password: 'MyStrongPassword!1',
        inviteCode: 'ZUKI-BETA-2026',
      },
      signupEnv
    );
    expect(badDomain).toMatchObject({ ok: false, status: 403 });

    // Valid signup succeeds (case-insensitive invite code)
    const created = await registerBetaUser(
      {
        name: 'Alex Marketing',
        email: 'Alex@Company.com',
        password: 'MyStrongPassword!1',
        inviteCode: 'zuki-beta-2026',
      },
      signupEnv
    );
    expect(created).toEqual({
      ok: true,
      user: { email: 'alex@company.com', name: 'Alex Marketing', role: 'beta' },
    });

    // Duplicate email rejected with 409
    const dup = await registerBetaUser(
      {
        name: 'Alex Again',
        email: 'alex@company.com',
        password: 'AnotherPassword!2',
        inviteCode: 'ZUKI-BETA-2026',
      },
      signupEnv
    );
    expect(dup).toMatchObject({ ok: false, status: 409 });

    // Newly registered user can sign in with their own password
    const authed = await authenticateBetaUserAsync(
      'alex@company.com',
      'MyStrongPassword!1',
      signupEnv
    );
    expect(authed).toEqual({ email: 'alex@company.com', name: 'Alex Marketing', role: 'beta' });
    expect(
      await authenticateBetaUserAsync('alex@company.com', 'WrongPassword!', signupEnv)
    ).toBeNull();

    // Token remains valid for self-registered users
    const token = createSessionToken(authed!, signupEnv);
    expect(verifySessionToken(token, signupEnv)).toEqual(authed);

    // Guard prevents ephemeral signups on Vercel without Redis/KV attached
    const vercelNoRedis = await registerBetaUser(
      {
        name: 'Sam',
        email: 'sam@company.com',
        password: 'MyStrongPassword!1',
        inviteCode: 'ZUKI-BETA-2026',
      },
      { ...signupEnv, VERCEL: '1' }
    );
    expect(vercelNoRedis).toMatchObject({ ok: false, status: 503 });
  });

  it('locks out brute-force login attempts after 10 failures and clears on success', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.42' };
    await clearLoginFailures(headers, {});

    for (let i = 0; i < 9; i++) {
      await recordLoginFailure(headers, {});
      expect((await checkLoginRateLimit(headers, {})).allowed).toBe(true);
    }

    await recordLoginFailure(headers, {});
    const blocked = await checkLoginRateLimit(headers, {});
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    await clearLoginFailures(headers, {});
    expect((await checkLoginRateLimit(headers, {})).allowed).toBe(true);
  });

  it('supports single beta passcode gate and revokes all sessions immediately when BETA_INVITE_CODE changes', () => {
    const passcodeEnv: NodeJS.ProcessEnv = {
      APP_ACCESS_MODE: 'passcode',
      BETA_INVITE_CODE: 'SecretPasscode!2026',
      AUTH_SESSION_SECRET: 'test-super-secret-key-32-chars-minimum',
    };

    expect(isPasscodeMode(passcodeEnv)).toBe(true);
    expect(isBetaAuthEnabled(passcodeEnv)).toBe(true);
    expect(isBetaSignupEnabled(passcodeEnv)).toBe(false);

    // Wrong code and wrong case rejected
    expect(authenticatePasscode('wrong-code', passcodeEnv)).toBeNull();
    expect(authenticatePasscode('secretpasscode!2026', passcodeEnv)).toBeNull();

    // Exact passcode succeeds
    const user = authenticatePasscode('SecretPasscode!2026', passcodeEnv);
    expect(user).not.toBeNull();

    const token = createSessionToken(user!, passcodeEnv);
    expect(verifySessionToken(token, passcodeEnv)).toEqual(user);

    // Changing BETA_INVITE_CODE immediately invalidates existing session cookies
    const rotatedEnv: NodeJS.ProcessEnv = {
      ...passcodeEnv,
      BETA_INVITE_CODE: 'NewRotatedCode!2026',
    };
    expect(verifySessionToken(token, rotatedEnv)).toBeNull();
  });
});
