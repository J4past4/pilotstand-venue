import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Bug,
  CheckCircle2,
  ChevronUp,
  Clock,
  ExternalLink,
  GitPullRequest,
  Lightbulb,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import type { BetaUser } from './BetaAuthGate';
import './launchModals.css';
import './feedbackBoard.css';

export type TicketType = 'bug' | 'improvement';
export type TicketArea =
  | '3d-viewport'
  | 'ai-designer'
  | 'catalog-assets'
  | 'export-quote'
  | 'ui-ux'
  | 'other';
export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus =
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'pr_ready'
  | 'completed'
  | 'declined';

export interface FeedbackTicket {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  area: TicketArea;
  priority: TicketPriority;
  reporterName: string;
  status: TicketStatus;
  votes: number;
  context?: {
    viewMode?: string;
    standSize?: string;
    itemCount?: number;
    appUrl?: string;
  };
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  githubPrUrl?: string;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface FeedbackBoardModalProps {
  open: boolean;
  onClose: () => void;
  betaUser?: BetaUser | null;
  standContext?: {
    viewMode?: string;
    standSize?: string;
    itemCount?: number;
  };
}

const LOCAL_TICKETS_KEY = 'pilotstand_feedback_tickets_local_v1';
const VOTED_IDS_KEY = 'pilotstand_feedback_voted_ids_v1';

const AREA_OPTIONS: Array<{ value: TicketArea; label: string }> = [
  { value: '3d-viewport', label: '3D Viewport & Controls' },
  { value: 'ai-designer', label: 'AI Designer' },
  { value: 'catalog-assets', label: 'Catalog & Custom Assets' },
  { value: 'export-quote', label: 'Export, Pricing & Quotes' },
  { value: 'ui-ux', label: 'UI / UX & Navigation' },
  { value: 'other', label: 'General / Other' },
];

const AREA_LABEL_MAP: Record<TicketArea, string> = {
  '3d-viewport': '3D Viewport',
  'ai-designer': 'AI Designer',
  'catalog-assets': 'Catalog & Assets',
  'export-quote': 'Export & Quotes',
  'ui-ux': 'UI / UX',
  other: 'General',
};

const STATUS_META: Record<TicketStatus, { label: string; icon: React.ReactNode }> = {
  pending_approval: { label: 'Awaiting Confirmation', icon: <Clock size={11} /> },
  approved: { label: 'Approved · Pinging Gemini', icon: <Sparkles size={11} /> },
  in_progress: { label: 'Gemini Agent Working', icon: <Bot size={11} /> },
  pr_ready: { label: 'Draft PR Ready', icon: <GitPullRequest size={11} /> },
  completed: { label: 'Completed', icon: <CheckCircle2 size={11} /> },
  declined: { label: 'Declined', icon: <XCircle size={11} /> },
};

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

function readVotedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(VOTED_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveVotedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(VOTED_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage errors
  }
}

function readLocalTickets(): FeedbackTicket[] {
  try {
    const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FeedbackTicket[]) : [];
  } catch {
    return [];
  }
}

function saveLocalTickets(tickets: FeedbackTicket[]): void {
  try {
    localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(tickets));
  } catch {
    // ignore storage errors
  }
}

export const FeedbackBoardModal: React.FC<FeedbackBoardModalProps> = ({
  open,
  onClose,
  betaUser,
  standContext,
}) => {
  const [view, setView] = useState<'board' | 'submit'>('board');
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [localFallbackMode, setLocalFallbackMode] = useState(false);
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [serverIsAdmin, setServerIsAdmin] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TicketType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus | 'active'>('all');

  // Upvotes
  const [votedIds, setVotedIds] = useState<Set<string>>(() => readVotedIds());
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  // Submission form state
  const [formType, setFormType] = useState<TicketType>('improvement');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formArea, setFormArea] = useState<TicketArea>('3d-viewport');
  const [formPriority, setFormPriority] = useState<TicketPriority>('medium');
  const [formNameOverride, setFormNameOverride] = useState<string | null>(null);
  const [formEmailOverride, setFormEmailOverride] = useState<string | null>(null);
  const [attachContext, setAttachContext] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const formName = formNameOverride ?? betaUser?.name ?? '';
  const formEmail = formEmailOverride ?? betaUser?.email ?? '';
  const isAdmin = betaUser?.role === 'admin' || serverIsAdmin;

  const fetchTicketsData = useCallback(async (forceSync = false) => {
    const resp = await fetch(`/api/tickets${forceSync ? '?sync=1' : ''}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const contentType = resp.headers.get('content-type') || '';
    if (resp.status === 404 || !contentType.includes('application/json')) {
      return {
        localFallback: true as const,
        tickets: readLocalTickets(),
        githubConfigured: false,
        isAdmin: false,
      };
    }
    const data = (await resp.json()) as {
      ok?: boolean;
      tickets?: FeedbackTicket[];
      githubConfigured?: boolean;
      isAdmin?: boolean;
      error?: string;
    };
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Unable to load tickets.');
    }
    return {
      localFallback: false as const,
      tickets: Array.isArray(data.tickets) ? data.tickets : [],
      githubConfigured: Boolean(data.githubConfigured),
      isAdmin: Boolean(data.isAdmin),
    };
  }, []);

  const loadTickets = useCallback(
    async (forceSync = false) => {
      setLoading(true);
      try {
        const res = await fetchTicketsData(forceSync);
        setLocalFallbackMode(res.localFallback);
        setTickets(res.tickets);
        setGithubConfigured(res.githubConfigured);
        setServerIsAdmin(res.isAdmin);
      } catch (err) {
        setBanner({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Failed to load tickets.',
        });
      } finally {
        setLoading(false);
      }
    },
    [fetchTicketsData]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchTicketsData(false)
      .then((res) => {
        if (cancelled) return;
        setBanner(null);
        setLocalFallbackMode(res.localFallback);
        setTickets(res.tickets);
        setGithubConfigured(res.githubConfigured);
        setServerIsAdmin(res.isAdmin);
      })
      .catch((err) => {
        if (cancelled) return;
        setBanner({
          kind: 'error',
          text: err instanceof Error ? err.message : 'Failed to load tickets.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchTicketsData]);

  const summary = useMemo(() => {
    let pending = 0;
    let active = 0;
    let prReady = 0;
    let completed = 0;
    for (const t of tickets) {
      if (t.status === 'pending_approval') pending++;
      else if (t.status === 'approved' || t.status === 'in_progress') active++;
      else if (t.status === 'pr_ready') prReady++;
      else if (t.status === 'completed') completed++;
    }
    return { pending, active, prReady, completed };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (statusFilter === 'active') {
        if (t.status !== 'approved' && t.status !== 'in_progress') return false;
      } else if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.reporterName.toLowerCase().includes(q) ||
        AREA_LABEL_MAP[t.area].toLowerCase().includes(q)
      );
    });
  }, [tickets, search, typeFilter, statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    const title = formTitle.trim();
    const description = formDescription.trim();
    if (title.length < 5) {
      setBanner({ kind: 'error', text: 'Please add a short title (at least 5 characters).' });
      return;
    }
    if (description.length < 10) {
      setBanner({
        kind: 'error',
        text: 'Please describe what you would like changed or added (at least 10 characters).',
      });
      return;
    }

    const contextPayload = attachContext
      ? {
          ...standContext,
          appUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }
      : undefined;

    if (localFallbackMode) {
      const now = Date.now();
      const created: FeedbackTicket = {
        id: `tkt-local-${now.toString(36)}`,
        type: formType,
        title,
        description,
        area: formArea,
        priority: formPriority,
        reporterName: formName.trim() || 'Anonymous',
        status: 'pending_approval',
        votes: 1,
        context: contextPayload,
        createdAt: now,
        updatedAt: now,
      };
      const next = [created, ...tickets];
      setTickets(next);
      saveLocalTickets(next);
      setHighlightId(created.id);
      setFormTitle('');
      setFormDescription('');
      setView('board');
      setBanner({
        kind: 'info',
        text: 'Ticket saved locally (static Vite preview mode). Deploy on Vercel with the GitHub feedback token configured to ping GitHub & Gemini Cloud Agent automatically.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/tickets', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          type: formType,
          title,
          description,
          area: formArea,
          priority: formPriority,
          reporterName: formName.trim() || undefined,
          reporterEmail: formEmail.trim() || undefined,
          context: contextPayload,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        ticket?: FeedbackTicket;
        message?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok || !data.ticket) {
        throw new Error(data.error || 'Could not submit ticket.');
      }

      setTickets((prev) => [data.ticket!, ...prev]);
      setHighlightId(data.ticket.id);
      const nextVoted = new Set(votedIds);
      nextVoted.add(data.ticket.id);
      setVotedIds(nextVoted);
      saveVotedIds(nextVoted);

      setFormTitle('');
      setFormDescription('');
      setView('board');
      setBanner({
        kind: 'success',
        text:
          data.message ||
          'Ticket submitted! The owner has been pinged for confirmation before Gemini runs.',
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Network error submitting ticket.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpvote = async (ticketId: string) => {
    if (votedIds.has(ticketId)) return;

    if (localFallbackMode) {
      const next = tickets.map((t) =>
        t.id === ticketId ? { ...t, votes: t.votes + 1 } : t
      );
      setTickets(next);
      saveLocalTickets(next);
      const nextVoted = new Set(votedIds);
      nextVoted.add(ticketId);
      setVotedIds(nextVoted);
      saveVotedIds(nextVoted);
      return;
    }

    setBusyTicketId(ticketId);
    try {
      const resp = await fetch('/api/tickets', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'upvote', ticketId }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        ticket?: FeedbackTicket;
      };
      if (resp.ok && data.ok && data.ticket) {
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? data.ticket! : t)));
        const nextVoted = new Set(votedIds);
        nextVoted.add(ticketId);
        setVotedIds(nextVoted);
        saveVotedIds(nextVoted);
      }
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleAdminDecision = async (
    ticketId: string,
    action: 'approve' | 'decline' | 'complete'
  ) => {
    setBanner(null);
    const adminNote = (adminNotes[ticketId] || '').trim() || undefined;

    if (localFallbackMode) {
      const nextStatus: TicketStatus =
        action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'completed';
      const next = tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              status: nextStatus,
              adminNote,
              reviewedBy: betaUser?.name || 'Admin',
              reviewedAt: Date.now(),
              updatedAt: Date.now(),
            }
          : t
      );
      setTickets(next);
      saveLocalTickets(next);
      return;
    }

    setBusyTicketId(ticketId);
    try {
      const resp = await fetch('/api/tickets', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, ticketId, adminNote }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        ticket?: FeedbackTicket;
        message?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok || !data.ticket) {
        throw new Error(data.error || 'Could not update ticket.');
      }
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? data.ticket! : t)));
      setAdminNotes((prev) => {
        const copy = { ...prev };
        delete copy[ticketId];
        return copy;
      });
      setBanner({
        kind: action === 'decline' ? 'info' : 'success',
        text: data.message || 'Ticket updated.',
      });
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to update ticket.',
      });
    } finally {
      setBusyTicketId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="launch-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-board-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="launch-modal-card xl fb-modal-card">
        <div className="launch-modal-head" style={{ marginBottom: 0 }}>
          <div>
            <div className="launch-modal-kicker">
              <Bot size={12} />
              <span>Ticketing Board · Owner-Confirmed Gemini Agent</span>
            </div>
            <h2 id="feedback-board-title" className="launch-modal-title">
              Report Issue or Suggest Improvement
            </h2>
            <p className="launch-modal-sub">
              Add a note of what you&apos;d like fixed, changed, or added. Nothing is auto-edited
              until the owner confirms — then Gemini Cloud Agent builds a Draft PR.
            </p>
          </div>
          <button
            type="button"
            className="launch-close-btn"
            onClick={onClose}
            aria-label="Close feedback board"
          >
            <X size={16} />
          </button>
        </div>

        <div className="fb-workflow-strip" aria-label="Approval workflow">
          <span className="fb-workflow-step">
            <span className="fb-workflow-num">1</span>
            <span>User submits ticket</span>
          </span>
          <span className="fb-workflow-arrow">→</span>
          <span className="fb-workflow-step">
            <span className="fb-workflow-num">2</span>
            <span>Pings owner via GitHub Issue</span>
          </span>
          <span className="fb-workflow-arrow">→</span>
          <span className="fb-workflow-step">
            <span className="fb-workflow-num">3</span>
            <span>Owner confirms</span>
          </span>
          <span className="fb-workflow-arrow">→</span>
          <span className="fb-workflow-step">
            <span className="fb-workflow-num">4</span>
            <span>Gemini Cloud Agent opens Draft PR</span>
          </span>
        </div>

        <div className="fb-toolbar">
          <div className="fb-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'board'}
              className={`fb-tab-btn ${view === 'board' ? 'active' : ''}`}
              onClick={() => setView('board')}
            >
              <span>Ticket Board</span>
              <span className="fb-tab-count">{tickets.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'submit'}
              className={`fb-tab-btn ${view === 'submit' ? 'active' : ''}`}
              onClick={() => setView('submit')}
            >
              <MessageSquarePlus size={14} />
              <span>New Ticket</span>
            </button>
            {isAdmin && summary.pending > 0 && (
              <button
                type="button"
                className={`fb-tab-btn ${view === 'board' && statusFilter === 'pending_approval' ? 'active' : ''}`}
                onClick={() => {
                  setView('board');
                  setStatusFilter('pending_approval');
                }}
              >
                <ShieldCheck size={14} />
                <span>Needs Confirmation</span>
                <span className="fb-tab-count pending">{summary.pending}</span>
              </button>
            )}
          </div>

          <div className="fb-toolbar-actions">
            {view === 'board' && (
              <button
                type="button"
                className="fb-ghost-btn"
                onClick={() => void loadTickets(true)}
                disabled={loading}
                title="Refresh tickets and sync status with GitHub"
              >
                <RefreshCw size={13} />
                <span>{loading ? 'Syncing…' : 'Sync Status'}</span>
              </button>
            )}
            {view === 'board' && (
              <button
                type="button"
                className="fb-primary-btn"
                onClick={() => setView('submit')}
              >
                <MessageSquarePlus size={14} />
                <span>Add Note / Ticket</span>
              </button>
            )}
          </div>
        </div>

        {banner && (
          <div className={`fb-banner ${banner.kind}`} role="status">
            <span>{banner.text}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              aria-label="Dismiss message"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {view === 'submit' ? (
          <form className="fb-form" onSubmit={handleSubmit}>
            <div className="fb-type-toggle">
              <button
                type="button"
                className={`fb-type-option bug ${formType === 'bug' ? 'active' : ''}`}
                onClick={() => setFormType('bug')}
              >
                <Bug size={18} color="#dc2626" />
                <div>
                  <span className="fb-type-option-title">Report an Issue</span>
                  <span className="fb-type-option-sub">Something broken, glitched, or unexpected</span>
                </div>
              </button>
              <button
                type="button"
                className={`fb-type-option improvement ${formType === 'improvement' ? 'active' : ''}`}
                onClick={() => setFormType('improvement')}
              >
                <Lightbulb size={18} color="#2563eb" />
                <div>
                  <span className="fb-type-option-title">Suggest Improvement</span>
                  <span className="fb-type-option-sub">New feature, UX tweak, or catalog request</span>
                </div>
              </button>
            </div>

            <div className="fb-field">
              <label htmlFor="fb-title-input">Short summary *</label>
              <input
                id="fb-title-input"
                className="fb-input"
                type="text"
                maxLength={140}
                required
                placeholder={
                  formType === 'bug'
                    ? 'e.g., Overhead hanging ring clips into back wall on 3×3m stand'
                    : 'e.g., Add keyboard shortcut to toggle 2D plan view'
                }
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="fb-field">
              <label htmlFor="fb-desc-input">
                What would you like changed or added? *
              </label>
              <textarea
                id="fb-desc-input"
                className="fb-textarea"
                maxLength={2000}
                required
                placeholder={
                  formType === 'bug'
                    ? 'Describe what happened, what you expected, and how to reproduce it…'
                    : 'Describe the change, feature, or improvement you want Gemini to build once confirmed…'
                }
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div className="fb-field-grid">
              <div className="fb-field">
                <label htmlFor="fb-area-select">Area of app</label>
                <select
                  id="fb-area-select"
                  className="fb-select"
                  value={formArea}
                  onChange={(e) => setFormArea(e.target.value as TicketArea)}
                >
                  {AREA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fb-field">
                <label htmlFor="fb-priority-select">Priority</label>
                <select
                  id="fb-priority-select"
                  className="fb-select"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as TicketPriority)}
                >
                  <option value="low">Low — nice to have</option>
                  <option value="medium">Medium — helpful improvement</option>
                  <option value="high">High — blocking or important</option>
                </select>
              </div>
            </div>

            <div className="fb-field-grid">
              <div className="fb-field">
                <label htmlFor="fb-name-input">Your name (optional)</label>
                <input
                  id="fb-name-input"
                  className="fb-input"
                  type="text"
                  maxLength={60}
                  placeholder="Shown on the board (or leave blank for Anonymous)"
                  value={formName}
                  onChange={(e) => setFormNameOverride(e.target.value)}
                />
              </div>
              <div className="fb-field">
                <label htmlFor="fb-email-input">Email (optional, kept private)</label>
                <input
                  id="fb-email-input"
                  className="fb-input"
                  type="email"
                  maxLength={120}
                  placeholder="Never displayed publicly"
                  value={formEmail}
                  onChange={(e) => setFormEmailOverride(e.target.value)}
                />
              </div>
            </div>

            {standContext && (
              <label className="fb-checkbox-row">
                <input
                  type="checkbox"
                  checked={attachContext}
                  onChange={(e) => setAttachContext(e.target.checked)}
                />
                <span>
                  Attach current stand context (
                  {[
                    standContext.standSize,
                    standContext.viewMode ? `${standContext.viewMode} view` : null,
                    standContext.itemCount !== undefined
                      ? `${standContext.itemCount} items`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  )
                </span>
              </label>
            )}

            <div className="fb-form-foot">
              <button
                type="button"
                className="fb-ghost-btn"
                onClick={() => setView('board')}
              >
                Back to Board
              </button>
              <button
                type="submit"
                className="fb-primary-btn"
                disabled={submitting}
              >
                <Send size={14} />
                <span>{submitting ? 'Submitting…' : 'Submit Ticket for Owner Confirmation'}</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="fb-summary-grid">
              <div className="fb-summary-card">
                <span className="fb-summary-val">{summary.pending}</span>
                <span className="fb-summary-label">Awaiting Confirmation</span>
              </div>
              <div className="fb-summary-card">
                <span className="fb-summary-val">{summary.active}</span>
                <span className="fb-summary-label">Gemini Agent Active</span>
              </div>
              <div className="fb-summary-card">
                <span className="fb-summary-val">{summary.prReady}</span>
                <span className="fb-summary-label">Draft PR Ready</span>
              </div>
              <div className="fb-summary-card">
                <span className="fb-summary-val">{summary.completed}</span>
                <span className="fb-summary-label">Completed</span>
              </div>
            </div>

            <div className="fb-filter-bar">
              <div className="fb-search-wrap">
                <Search size={14} className="fb-search-icon" />
                <input
                  type="text"
                  className="fb-search-input"
                  placeholder="Search tickets…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="fb-select"
                aria-label="Filter by ticket type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | TicketType)}
              >
                <option value="all">All Types</option>
                <option value="bug">Issues / Bugs</option>
                <option value="improvement">Improvements</option>
              </select>
              <select
                className="fb-select"
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | TicketStatus | 'active')
                }
              >
                <option value="all">All Statuses</option>
                <option value="pending_approval">Awaiting Confirmation</option>
                <option value="active">Approved / Gemini Working</option>
                <option value="pr_ready">Draft PR Ready</option>
                <option value="completed">Completed</option>
                <option value="declined">Declined</option>
              </select>
            </div>

            <div className="fb-ticket-list">
              {loading && tickets.length === 0 ? (
                <div className="fb-empty">Loading ticketing board…</div>
              ) : filteredTickets.length === 0 ? (
                <div className="fb-empty">
                  {tickets.length === 0
                    ? 'No tickets yet — be the first to report an issue or suggest an improvement!'
                    : 'No tickets match your current filters.'}
                </div>
              ) : (
                filteredTickets.map((ticket) => {
                  const statusInfo = STATUS_META[ticket.status];
                  const voted = votedIds.has(ticket.id);
                  const isBusy = busyTicketId === ticket.id;
                  return (
                    <article
                      key={ticket.id}
                      className={`fb-ticket-card ${highlightId === ticket.id ? 'highlight' : ''}`}
                    >
                      <button
                        type="button"
                        className={`fb-vote-btn ${voted ? 'voted' : ''}`}
                        onClick={() => void handleUpvote(ticket.id)}
                        disabled={voted || isBusy}
                        title={voted ? 'Upvoted' : 'Upvote this ticket'}
                        aria-label={`Upvote ${ticket.title} (${ticket.votes} votes)`}
                      >
                        <ChevronUp size={15} />
                        <span>{ticket.votes}</span>
                      </button>

                      <div className="fb-ticket-main">
                        <div className="fb-ticket-top">
                          <span className={`fb-badge type-${ticket.type}`}>
                            {ticket.type === 'bug' ? <Bug size={11} /> : <Lightbulb size={11} />}
                            <span>{ticket.type === 'bug' ? 'Issue' : 'Improvement'}</span>
                          </span>
                          <span className={`fb-badge status-${ticket.status}`}>
                            {statusInfo.icon}
                            <span>{statusInfo.label}</span>
                          </span>
                          <span className="fb-badge area">{AREA_LABEL_MAP[ticket.area]}</span>
                          {ticket.priority === 'high' && (
                            <span className="fb-badge priority-high">High Priority</span>
                          )}
                        </div>

                        <h3 className="fb-ticket-title">{ticket.title}</h3>
                        <p className="fb-ticket-desc">{ticket.description}</p>

                        {ticket.adminNote && (
                          <div className="fb-admin-note">
                            <strong>Owner note:</strong> {ticket.adminNote}
                          </div>
                        )}

                        <div className="fb-ticket-meta">
                          <span>By {ticket.reporterName}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(ticket.createdAt)}</span>
                          {ticket.githubIssueUrl && ticket.githubIssueNumber && (
                            <>
                              <span>·</span>
                              <a
                                href={ticket.githubIssueUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="fb-ext-link"
                              >
                                <span>GitHub #{ticket.githubIssueNumber}</span>
                                <ExternalLink size={11} />
                              </a>
                            </>
                          )}
                          {ticket.githubPrUrl && (
                            <a
                              href={ticket.githubPrUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="fb-pr-link"
                            >
                              <GitPullRequest size={12} />
                              <span>View Draft PR</span>
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>

                        {isAdmin && ticket.status === 'pending_approval' && (
                          <div className="fb-admin-bar">
                            <div className="fb-admin-row">
                              <input
                                type="text"
                                className="fb-admin-note-input"
                                placeholder="Optional guidance for Gemini agent (or decline reason)…"
                                value={adminNotes[ticket.id] || ''}
                                onChange={(e) =>
                                  setAdminNotes((prev) => ({
                                    ...prev,
                                    [ticket.id]: e.target.value,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="fb-approve-btn"
                                disabled={isBusy}
                                onClick={() => void handleAdminDecision(ticket.id, 'approve')}
                              >
                                <Sparkles size={13} />
                                <span>{isBusy ? 'Confirming…' : 'Approve & Ping Gemini'}</span>
                              </button>
                              <button
                                type="button"
                                className="fb-decline-btn"
                                disabled={isBusy}
                                onClick={() => void handleAdminDecision(ticket.id, 'decline')}
                              >
                                <XCircle size={13} />
                                <span>Decline</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {isAdmin &&
                          (ticket.status === 'approved' ||
                            ticket.status === 'in_progress' ||
                            ticket.status === 'pr_ready') && (
                            <div className="fb-admin-bar">
                              <div className="fb-admin-row">
                                <button
                                  type="button"
                                  className="fb-complete-btn"
                                  disabled={isBusy}
                                  onClick={() => void handleAdminDecision(ticket.id, 'complete')}
                                >
                                  <CheckCircle2 size={13} />
                                  <span>Mark Completed</span>
                                </button>
                              </div>
                            </div>
                          )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {isAdmin && !githubConfigured && !localFallbackMode && (
              <div className="fb-banner info">
                <span>
                  <strong>GitHub bridge not yet connected:</strong> Add your GitHub feedback token
                  in Vercel Environment Variables (see <code>.env.example</code>) to auto-create
                  GitHub Issues and trigger the Gemini Cloud Agent workflow on approval.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
