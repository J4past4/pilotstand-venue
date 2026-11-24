import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, LogIn, ShieldCheck } from 'lucide-react';
import './authGate.css';

export interface BetaUser {
  email: string;
  name: string;
  role: 'admin' | 'beta';
}

interface SessionResponse {
  authEnabled: boolean;
  authenticated: boolean;
  user: BetaUser | null;
}

interface BetaAuthGateProps {
  children: (session: {
    user: BetaUser | null;
    authEnabled: boolean;
    onSignOut: () => Promise<void>;
  }) => React.ReactNode;
}

export const BetaAuthGate: React.FC<BetaAuthGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'checking' | 'ready' | 'login' | 'error'>('checking');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [user, setUser] = useState<BetaUser | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSessionState = useCallback(async () => {
    try {
      const resp = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      const contentType = resp.headers.get('content-type') || '';
      // In static local dev / vite preview (no Vercel API server), /api/* falls back to HTML or 404.
      if (resp.status === 404 || !contentType.includes('application/json')) {
        return { kind: 'ready' as const, authEnabled: false, user: null, error: null };
      }

      if (!resp.ok) {
        return {
          kind: 'error' as const,
          authEnabled: true,
          user: null,
          error: 'Unable to verify beta access right now. Please try again.',
        };
      }

      const data = (await resp.json()) as SessionResponse;
      if (!data.authEnabled || (data.authenticated && data.user)) {
        return {
          kind: 'ready' as const,
          authEnabled: Boolean(data.authEnabled),
          user: data.user || null,
          error: null,
        };
      }
      return { kind: 'login' as const, authEnabled: true, user: null, error: null };
    } catch {
      return {
        kind: 'error' as const,
        authEnabled: true,
        user: null,
        error: 'Could not connect to the authentication service. Please check your connection.',
      };
    }
  }, []);

  const checkSession = useCallback(async () => {
    setStatus('checking');
    setErrorMsg(null);
    const res = await fetchSessionState();
    setAuthEnabled(res.authEnabled);
    setUser(res.user);
    setErrorMsg(res.error);
    setStatus(res.kind);
  }, [fetchSessionState]);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionState().then((res) => {
      if (cancelled) return;
      setAuthEnabled(res.authEnabled);
      setUser(res.user);
      setErrorMsg(res.error);
      setStatus(res.kind);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSessionState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        user?: BetaUser | null;
        error?: string;
      };

      if (!resp.ok || !data.ok) {
        setErrorMsg(data.error || 'Invalid email or password.');
        return;
      }

      setUser(data.user || null);
      setAuthEnabled(true);
      setPassword('');
      setStatus('ready');
    } catch {
      setErrorMsg('Network error while signing in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Clear local session state even if network hiccups
    }
    setUser(null);
    if (authEnabled) {
      setStatus('login');
    }
  }, [authEnabled]);

  if (status === 'checking') {
    return (
      <div className="beta-auth-shell" aria-busy="true">
        <div className="beta-auth-loading">
          <div className="beta-auth-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M2 2h11l8 10h-11L2 2Z" />
              <path d="M10 12h11l-8 10H2l8-10Z" opacity=".8" />
            </svg>
          </div>
          <span>Opening Zuki Exhibition Planner…</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="beta-auth-shell">
        <div className="beta-auth-card" role="alert">
          <div className="beta-auth-badge">
            <Lock size={12} />
            <span>Private Beta</span>
          </div>
          <h1 className="beta-auth-title">Connection Issue</h1>
          <p className="beta-auth-sub">{errorMsg}</p>
          <button
            type="button"
            className="beta-auth-submit"
            onClick={() => void checkSession()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="beta-auth-shell">
        <div className="beta-auth-card">
          <div className="beta-auth-header">
            <div className="beta-auth-brand-row">
              <div className="beta-auth-brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M2 2h11l8 10h-11L2 2Z" />
                  <path d="M10 12h11l-8 10H2l8-10Z" opacity=".8" />
                </svg>
              </div>
              <div>
                <div className="beta-auth-brand-name">Zuki</div>
                <div className="beta-auth-brand-sub">Exhibition Stand Planner</div>
              </div>
            </div>
            <span className="beta-auth-badge">
              <ShieldCheck size={12} />
              <span>Private Beta</span>
            </span>
          </div>

          <h1 className="beta-auth-title">Sign in to your workspace</h1>
          <p className="beta-auth-sub">
            Enter your personal beta credentials to access the 3D stand planner and your saved
            projects.
          </p>

          <form className="beta-auth-form" onSubmit={handleSubmit} noValidate>
            <label className="beta-auth-field">
              <span>Work Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </label>

            <label className="beta-auth-field">
              <span>Password</span>
              <div className="beta-auth-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="beta-auth-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            {errorMsg && (
              <div className="beta-auth-error" role="alert">
                {errorMsg}
              </div>
            )}

            <button type="submit" className="beta-auth-submit" disabled={submitting}>
              <LogIn size={15} />
              <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
            </button>
          </form>

          <p className="beta-auth-footer">
            Invite-only preview by Zuki Studio. Need access? Contact your team admin.
          </p>
        </div>
      </div>
    );
  }

  return <>{children({ user, authEnabled, onSignOut: handleSignOut })}</>;
};
