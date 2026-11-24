import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LogIn,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import type { BetaUser } from './BetaAuthGate';
import './launchModals.css';

export interface PublicLaunchModalProps {
  open: boolean;
  initialMode?: 'signup' | 'signin';
  contextMessage?: string | null;
  onClose: () => void;
  onAuthenticated: (user: BetaUser) => void;
  onOpenSupplierModal?: () => void;
}

const USER_TYPE_OPTIONS = [
  { value: 'exhibitor', label: 'Exhibitor / Brand Team' },
  { value: 'agency', label: 'Event / Marketing Agency' },
  { value: 'builder', label: 'Stand Builder / Contractor' },
  { value: 'supplier', label: 'Equipment / Print Supplier' },
  { value: 'other', label: 'Other' },
] as const;

const STAND_SIZE_OPTIONS = [
  '3×3m Inline',
  '4×3m Corner',
  '6×3m Peninsula',
  '6×6m+ Island',
  'Multiple / Varies',
] as const;

export const PublicLaunchModal: React.FC<PublicLaunchModalProps> = ({
  open,
  initialMode = 'signup',
  contextMessage,
  onClose,
  onAuthenticated,
  onOpenSupplierModal,
}) => {
  const [mode, setMode] = useState<'signup' | 'signin'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [userType, setUserType] = useState<string>('exhibitor');
  const [upcomingEvent, setUpcomingEvent] = useState('');
  const [standSize, setStandSize] = useState<string>('4×3m Corner');
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isSignup = mode === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmedEmail = email.trim();

    if (isSignup) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) {
        setErrorMsg('Please enter your full name (at least 2 characters).');
        return;
      }
      if (!trimmedEmail || !trimmedEmail.includes('@')) {
        setErrorMsg('Please enter a valid work email address.');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Please choose a password of at least 8 characters.');
        return;
      }

      setSubmitting(true);
      try {
        const resp = await fetch('/api/auth/signup', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            email: trimmedEmail,
            password,
            company: company.trim() || undefined,
            userType,
            upcomingEvent: upcomingEvent.trim() || undefined,
            standSize,
            marketingOptIn,
          }),
        });

        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: BetaUser | null;
          error?: string;
        };

        if (!resp.ok || !data.ok || !data.user) {
          setErrorMsg(data.error || 'Could not create your free account right now.');
          return;
        }

        setPassword('');
        onAuthenticated(data.user);
      } catch {
        setErrorMsg('Network error while creating your account. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

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

      if (!resp.ok || !data.ok || !data.user) {
        setErrorMsg(data.error || 'Invalid email or password.');
        return;
      }

      setPassword('');
      onAuthenticated(data.user);
    } catch {
      setErrorMsg('Network error while signing in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="launch-modal-backdrop" onClick={onClose}>
      <div
        className="launch-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-launch-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="launch-modal-head">
          <div>
            <span className="launch-modal-kicker">
              <Sparkles size={11} />
              <span>Free Public Access</span>
            </span>
            <h2 id="public-launch-modal-title" className="launch-modal-title">
              {isSignup ? 'Create your free planner account' : 'Sign in to your account'}
            </h2>
            <p className="launch-modal-sub">
              {isSignup
                ? 'Save unlimited exhibition stand designs, export print-ready PDF briefs, and unlock supplier quotes — completely free.'
                : 'Welcome back. Sign in to access your saved stands and export production briefs.'}
            </p>
          </div>
          <button
            type="button"
            className="launch-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {contextMessage && (
          <div className="launch-context-banner" role="status">
            <CheckCircle2 size={15} />
            <span>{contextMessage}</span>
          </div>
        )}

        <div className="launch-tabs" role="tablist" aria-label="Account mode">
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={isSignup ? 'active' : ''}
            onClick={() => {
              setMode('signup');
              setErrorMsg(null);
            }}
          >
            Create free account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={!isSignup ? 'active' : ''}
            onClick={() => {
              setMode('signin');
              setErrorMsg(null);
            }}
          >
            Sign in
          </button>
        </div>

        <form className="launch-form" onSubmit={handleSubmit} noValidate>
          {isSignup && (
            <div className="launch-form-grid">
              <label className="launch-field">
                <span>Full Name</span>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="Alex Taylor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="launch-field">
                <span>
                  Company / Brand <span className="optional-tag">(optional)</span>
                </span>
                <input
                  type="text"
                  name="company"
                  autoComplete="organization"
                  placeholder="Acme Robotics Ltd"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </div>
          )}

          <label className="launch-field">
            <span>Work Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </label>

          <label className="launch-field">
            <span>{isSignup ? 'Create Password (8+ characters)' : 'Password'}</span>
            <div className="launch-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className="launch-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          {isSignup && (
            <>
              <div className="launch-form-grid">
                <label className="launch-field">
                  <span>I am a…</span>
                  <select
                    name="userType"
                    value={userType}
                    onChange={(e) => setUserType(e.target.value)}
                    disabled={submitting}
                  >
                    {USER_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="launch-field">
                  <span>Typical Stand Size</span>
                  <select
                    name="standSize"
                    value={standSize}
                    onChange={(e) => setStandSize(e.target.value)}
                    disabled={submitting}
                  >
                    {STAND_SIZE_OPTIONS.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="launch-field">
                <span>
                  Next Trade Show / Event <span className="optional-tag">(optional)</span>
                </span>
                <input
                  type="text"
                  name="upcomingEvent"
                  placeholder="e.g. ExCeL London — Oct 2026"
                  value={upcomingEvent}
                  onChange={(e) => setUpcomingEvent(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="launch-checkbox">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  disabled={submitting}
                />
                <span>
                  Send me product updates &amp; new 3D exhibition kit releases. We never share your
                  email with suppliers unless you explicitly request a quote.
                </span>
              </label>
            </>
          )}

          {errorMsg && (
            <div className="launch-error" role="alert">
              {errorMsg}
            </div>
          )}

          <button type="submit" className="launch-submit-btn" disabled={submitting}>
            {isSignup ? <UserPlus size={15} /> : <LogIn size={15} />}
            <span>
              {submitting
                ? isSignup
                  ? 'Creating free account…'
                  : 'Signing in…'
                : isSignup
                  ? 'Create Free Account & Continue'
                  : 'Sign In'}
            </span>
          </button>
        </form>

        <div className="launch-footer-bar">
          <span>Free forever for exhibitors.</span>
          {onOpenSupplierModal && (
            <button
              type="button"
              className="launch-link-btn"
              onClick={() => {
                onClose();
                onOpenSupplierModal();
              }}
            >
              <span>Supply exhibition kit? List your products</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
