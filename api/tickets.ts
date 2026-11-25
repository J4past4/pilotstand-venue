import { hasDurableUserStore, requireAdminSession } from './_lib/auth.ts';
import { checkPublicFormRateLimit } from './_lib/launchStore.ts';
import { isAllowedOrigin } from './_lib/security.ts';
import {
  createFeedbackTicket,
  isGitHubFeedbackConfigured,
  listPublicFeedbackTickets,
  reviewFeedbackTicket,
  upvoteFeedbackTicket,
  type TicketArea,
  type TicketContext,
  type TicketPriority,
  type TicketType,
} from './_lib/ticketStore.ts';

interface VercelLikeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  setHeader(name: string, value: string): void;
  json(payload: unknown): void;
}

interface CreateTicketBody {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  area?: unknown;
  priority?: unknown;
  reporterName?: unknown;
  reporterEmail?: unknown;
  context?: unknown;
}

interface PatchTicketBody {
  action?: unknown;
  ticketId?: unknown;
  adminNote?: unknown;
}

function parseJsonBody<T>(rawBody: unknown): { ok: true; body: T } | { ok: false } {
  if (typeof rawBody === 'string') {
    try {
      return { ok: true, body: JSON.parse(rawBody) as T };
    } catch {
      return { ok: false };
    }
  }
  return { ok: true, body: (rawBody ?? {}) as T };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const adminAuth = requireAdminSession(req.headers);
      const forceSync =
        typeof req.url === 'string' && req.url.includes('sync=1');
      const tickets = await listPublicFeedbackTickets(100, process.env, {
        syncGitHub: true,
        forceSync,
      });

      return res.status(200).json({
        ok: true,
        tickets,
        githubConfigured: isGitHubFeedbackConfigured(),
        durableStorageConnected: hasDurableUserStore(),
        isAdmin: adminAuth.authorized,
      });
    } catch (err) {
      console.error('[tickets] GET error:', err);
      return res.status(503).json({ error: 'Unable to load feedback tickets right now.' });
    }
  }

  if (req.method === 'POST') {
    if (!isAllowedOrigin(req.headers)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }

    const limit = await checkPublicFormRateLimit(req.headers, 'feedback-ticket', 6, 900);
    if (!limit.allowed) {
      return res.status(429).json({
        error: `Too many tickets submitted recently. Please wait ${Math.ceil((limit.retryAfterSec || 60) / 60)} minute(s) and try again.`,
      });
    }

    const parsed = parseJsonBody<CreateTicketBody>(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
    const body = parsed.body;

    try {
      const result = await createFeedbackTicket({
        type: (body.type === 'bug' ? 'bug' : 'improvement') as TicketType,
        title: typeof body.title === 'string' ? body.title : '',
        description: typeof body.description === 'string' ? body.description : '',
        area: typeof body.area === 'string' ? (body.area as TicketArea) : undefined,
        priority: typeof body.priority === 'string' ? (body.priority as TicketPriority) : undefined,
        reporterName: typeof body.reporterName === 'string' ? body.reporterName : undefined,
        reporterEmail: typeof body.reporterEmail === 'string' ? body.reporterEmail : undefined,
        context:
          body.context && typeof body.context === 'object'
            ? (body.context as TicketContext)
            : undefined,
      });

      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }

      return res.status(201).json({
        ok: true,
        ticket: result.ticket,
        githubPinged: result.githubPinged,
        message: result.githubPinged
          ? 'Ticket submitted! The owner has been pinged via GitHub Issue for confirmation before the Gemini agent runs.'
          : 'Ticket submitted! It is now waiting for owner confirmation in the Admin Queue.',
      });
    } catch (err) {
      console.error('[tickets] POST error:', err);
      return res.status(503).json({
        error: 'Could not submit your ticket right now. Please try again shortly.',
      });
    }
  }

  if (req.method === 'PATCH') {
    if (!isAllowedOrigin(req.headers)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }

    const parsed = parseJsonBody<PatchTicketBody>(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
    const body = parsed.body;
    const action = typeof body.action === 'string' ? body.action : '';
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId : '';

    if (!ticketId) {
      return res.status(400).json({ error: 'Missing ticketId.' });
    }

    try {
      if (action === 'upvote') {
        const limit = await checkPublicFormRateLimit(req.headers, 'ticket-upvote', 30, 900);
        if (!limit.allowed) {
          return res.status(429).json({ error: 'Too many votes. Please try again shortly.' });
        }
        const result = await upvoteFeedbackTicket(ticketId, req.headers);
        if (!result.ok) {
          return res.status(result.status).json({ error: result.error });
        }
        return res.status(200).json({
          ok: true,
          ticket: result.ticket,
          alreadyVoted: result.alreadyVoted,
        });
      }

      if (action === 'approve' || action === 'decline' || action === 'complete') {
        const auth = requireAdminSession(req.headers);
        if (!auth.authorized || !auth.user) {
          return res.status(403).json({ error: 'Admin confirmation access required.' });
        }

        const result = await reviewFeedbackTicket({
          ticketId,
          decision: action,
          adminName: auth.user.name || auth.user.email,
          adminNote: typeof body.adminNote === 'string' ? body.adminNote : undefined,
        });

        if (!result.ok) {
          return res.status(result.status).json({ error: result.error });
        }

        return res.status(200).json({
          ok: true,
          ticket: result.ticket,
          agentTriggered: result.agentTriggered,
          message:
            action === 'approve'
              ? result.agentTriggered
                ? 'Confirmed! Added agent-approved label on GitHub — Gemini Cloud Agent is starting.'
                : 'Ticket marked approved. Connect GITHUB_FEEDBACK_TOKEN to auto-trigger the GitHub Gemini Agent.'
              : action === 'decline'
                ? 'Ticket declined.'
                : 'Ticket marked completed.',
        });
      }

      return res.status(400).json({ error: 'Unsupported ticket action.' });
    } catch (err) {
      console.error('[tickets] PATCH error:', err);
      return res.status(503).json({ error: 'Could not update ticket right now.' });
    }
  }

  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
