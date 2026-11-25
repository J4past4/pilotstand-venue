import { randomBytes } from 'node:crypto';
import { hasDurableUserStore, redisPipeline } from './auth.ts';
import { extractClientIp } from './security.ts';

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

export interface TicketContext {
  viewMode?: string;
  standSize?: string;
  itemCount?: number;
  appUrl?: string;
}

export interface FeedbackTicketInput {
  type: TicketType;
  title: string;
  description: string;
  area?: TicketArea;
  priority?: TicketPriority;
  reporterName?: string;
  reporterEmail?: string;
  context?: TicketContext;
}

export interface FeedbackTicketRecord {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  area: TicketArea;
  priority: TicketPriority;
  reporterName: string;
  reporterEmail?: string;
  status: TicketStatus;
  votes: number;
  context?: TicketContext;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  githubPrUrl?: string;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type PublicFeedbackTicket = Omit<FeedbackTicketRecord, 'reporterEmail'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TICKET_IDS_KEY = 'zuki-expo:tickets:ids';
const MAX_STORED_TICKETS = 250;
const DEFAULT_GITHUB_REPO = 'J4past4/exhibition-stand-';
const GITHUB_SYNC_TTL_MS = 20_000;

const VALID_TYPES = new Set<TicketType>(['bug', 'improvement']);
const VALID_AREAS = new Set<TicketArea>([
  '3d-viewport',
  'ai-designer',
  'catalog-assets',
  'export-quote',
  'ui-ux',
  'other',
]);
const VALID_PRIORITIES = new Set<TicketPriority>(['low', 'medium', 'high']);

const AREA_LABELS: Record<TicketArea, string> = {
  '3d-viewport': '3D Viewport & Controls',
  'ai-designer': 'AI Designer',
  'catalog-assets': 'Catalog & Custom Assets',
  'export-quote': 'Export, Pricing & Quotes',
  'ui-ux': 'UI / UX & Navigation',
  other: 'General / Other',
};

// Local dev / unit-test in-memory fallback store
const memoryTickets = new Map<string, FeedbackTicketRecord>();
const memoryTicketOrder: string[] = [];
const memoryVoteGuards = new Map<string, number>();
let lastGitHubSyncAt = 0;

export function clearInMemoryTicketStore(): void {
  memoryTickets.clear();
  memoryTicketOrder.length = 0;
  memoryVoteGuards.clear();
  lastGitHubSyncAt = 0;
}

function ticketRedisKey(id: string): string {
  return `zuki-expo:ticket:${id}`;
}

function cleanSingleLine(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function cleanMultiline(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLen);
}

function sanitizeContext(raw: TicketContext | undefined): TicketContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const viewMode = cleanSingleLine(raw.viewMode, 32) || undefined;
  const standSize = cleanSingleLine(raw.standSize, 40) || undefined;
  const itemCount =
    typeof raw.itemCount === 'number' && Number.isFinite(raw.itemCount) && raw.itemCount >= 0
      ? Math.min(500, Math.round(raw.itemCount))
      : undefined;
  const rawUrl = cleanSingleLine(raw.appUrl, 240);
  const appUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined;
  if (!viewMode && !standSize && itemCount === undefined && !appUrl) return undefined;
  return { viewMode, standSize, itemCount, appUrl };
}

export function toPublicTicket(record: FeedbackTicketRecord): PublicFeedbackTicket {
  const { reporterEmail: _omitted, ...pub } = record;
  return pub;
}

export function getGitHubFeedbackConfig(
  env: NodeJS.ProcessEnv = process.env
): { token: string; owner: string; repo: string } | null {
  const token = (env.GITHUB_FEEDBACK_TOKEN || env.GITHUB_TOKEN || '').trim();
  if (!token) return null;
  const fullRepo = (env.GITHUB_FEEDBACK_REPO || DEFAULT_GITHUB_REPO).trim();
  const [owner, repo] = fullRepo.split('/');
  if (!owner || !repo) return null;
  return { token, owner, repo };
}

export function isGitHubFeedbackConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(getGitHubFeedbackConfig(env));
}

async function githubFetch(
  path: string,
  init: RequestInit,
  env: NodeJS.ProcessEnv = process.env
): Promise<Response | null> {
  const cfg = getGitHubFeedbackConfig(env);
  if (!cfg) return null;
  return fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'PilotStand-Feedback-Board',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
}

function buildGitHubIssueBody(ticket: FeedbackTicketRecord): string {
  const typeLabel = ticket.type === 'bug' ? 'Bug Report' : 'Improvement Suggestion';
  const contextLines: string[] = [];
  if (ticket.context?.standSize) contextLines.push(`- **Stand Size:** ${ticket.context.standSize}`);
  if (ticket.context?.viewMode) contextLines.push(`- **View Mode:** ${ticket.context.viewMode}`);
  if (ticket.context?.itemCount !== undefined) {
    contextLines.push(`- **Placed Items:** ${ticket.context.itemCount}`);
  }
  if (ticket.context?.appUrl) contextLines.push(`- **Page URL:** ${ticket.context.appUrl}`);

  const lines = [
    `## ${typeLabel} from PilotStand Ticketing Board`,
    '',
    `| Field | Value |`,
    `| :--- | :--- |`,
    `| **Ticket ID** | \`${ticket.id}\` |`,
    `| **Type** | ${typeLabel} |`,
    `| **Area** | ${AREA_LABELS[ticket.area]} |`,
    `| **Priority** | ${ticket.priority.toUpperCase()} |`,
    `| **Submitted By** | ${ticket.reporterName} |`,
    '',
    '### Requested Change / Issue Details',
    '',
    ticket.description,
    '',
  ];

  if (contextLines.length > 0) {
    lines.push('### Studio Context', '', ...contextLines, '');
  }

  lines.push(
    '---',
    '### Owner Confirmation Gate',
    '> **No code changes will be made until you confirm.**',
    '> To ping the **Gemini Cloud Agent** to implement this ticket and open a **Draft PR**:',
    '> - Add the `agent-approved` label to this issue, **or**',
    '> - Click **Approve & Ping Gemini Agent** inside PilotStand\'s Feedback Board (signed in as admin).'
  );

  return lines.join('\n');
}

async function createGitHubIssueForTicket(
  ticket: FeedbackTicketRecord,
  initialLabels: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<{ number: number; url: string } | null> {
  try {
    const prefix = ticket.type === 'bug' ? '[Issue]' : '[Suggestion]';
    const resp = await githubFetch(
      '/issues',
      {
        method: 'POST',
        body: JSON.stringify({
          title: `${prefix} ${ticket.title}`,
          body: buildGitHubIssueBody(ticket),
          labels: initialLabels,
        }),
      },
      env
    );
    if (!resp || !resp.ok) {
      if (resp) {
        const text = await resp.text().catch(() => '');
        console.error('[ticketStore] GitHub issue create failed:', resp.status, text.slice(0, 240));
      }
      return null;
    }
    const data = (await resp.json()) as { number?: number; html_url?: string };
    if (typeof data.number === 'number' && typeof data.html_url === 'string') {
      return { number: data.number, url: data.html_url };
    }
    return null;
  } catch (err) {
    console.error('[ticketStore] GitHub issue create error:', err);
    return null;
  }
}

async function saveTicketRecord(
  ticket: FeedbackTicketRecord,
  isNew: boolean,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (hasDurableUserStore(env)) {
    const commands: Array<Array<string | number>> = [
      ['SET', ticketRedisKey(ticket.id), JSON.stringify(ticket)],
    ];
    if (isNew) {
      commands.push(['LPUSH', TICKET_IDS_KEY, ticket.id]);
      commands.push(['LTRIM', TICKET_IDS_KEY, 0, MAX_STORED_TICKETS - 1]);
    }
    await redisPipeline(commands, env);
    return;
  }

  memoryTickets.set(ticket.id, ticket);
  if (isNew) {
    memoryTicketOrder.unshift(ticket.id);
    if (memoryTicketOrder.length > MAX_STORED_TICKETS) {
      const removed = memoryTicketOrder.splice(MAX_STORED_TICKETS);
      for (const oldId of removed) memoryTickets.delete(oldId);
    }
  }
}

export async function getTicketById(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<FeedbackTicketRecord | null> {
  const cleanId = cleanSingleLine(id, 64);
  if (!cleanId) return null;

  if (hasDurableUserStore(env)) {
    const res = await redisPipeline([['GET', ticketRedisKey(cleanId)]], env);
    const raw = res?.[0]?.result;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as FeedbackTicketRecord;
    } catch {
      return null;
    }
  }

  return memoryTickets.get(cleanId) ?? null;
}

async function listRawTickets(
  limit = 100,
  env: NodeJS.ProcessEnv = process.env
): Promise<FeedbackTicketRecord[]> {
  if (hasDurableUserStore(env)) {
    const idsResp = await redisPipeline([['LRANGE', TICKET_IDS_KEY, 0, limit - 1]], env);
    const ids = Array.isArray(idsResp?.[0]?.result)
      ? (idsResp[0].result as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    if (ids.length === 0) return [];

    const getResp = await redisPipeline(
      ids.map((id) => ['GET', ticketRedisKey(id)]),
      env
    );
    const tickets: FeedbackTicketRecord[] = [];
    for (const entry of getResp || []) {
      if (typeof entry?.result !== 'string') continue;
      try {
        tickets.push(JSON.parse(entry.result) as FeedbackTicketRecord);
      } catch {
        // skip malformed entry
      }
    }
    return tickets;
  }

  return memoryTicketOrder
    .slice(0, limit)
    .map((id) => memoryTickets.get(id))
    .filter((t): t is FeedbackTicketRecord => Boolean(t));
}

export async function createFeedbackTicket(
  input: FeedbackTicketInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<
  | { ok: true; ticket: PublicFeedbackTicket; githubPinged: boolean }
  | { ok: false; status: number; error: string }
> {
  const type: TicketType = VALID_TYPES.has(input.type) ? input.type : 'improvement';
  const title = cleanSingleLine(input.title, 140);
  const description = cleanMultiline(input.description, 2000);
  const area: TicketArea = input.area && VALID_AREAS.has(input.area) ? input.area : 'other';
  const priority: TicketPriority =
    input.priority && VALID_PRIORITIES.has(input.priority) ? input.priority : 'medium';
  const reporterName = cleanSingleLine(input.reporterName, 60) || 'Anonymous';
  const rawEmail = cleanSingleLine(input.reporterEmail, 120).toLowerCase();
  const reporterEmail = rawEmail ? rawEmail : undefined;
  const context = sanitizeContext(input.context);

  if (title.length < 5) {
    return { ok: false, status: 400, error: 'Please add a short title (at least 5 characters).' };
  }
  if (description.length < 10) {
    return {
      ok: false,
      status: 400,
      error: 'Please describe the issue or improvement in a bit more detail (at least 10 characters).',
    };
  }
  if (reporterEmail && !EMAIL_RE.test(reporterEmail)) {
    return { ok: false, status: 400, error: 'Please enter a valid email address or leave it blank.' };
  }

  const now = Date.now();
  const ticket: FeedbackTicketRecord = {
    id: `tkt-${now.toString(36)}-${randomBytes(3).toString('hex')}`,
    type,
    title,
    description,
    area,
    priority,
    reporterName,
    reporterEmail,
    status: 'pending_approval',
    votes: 1,
    context,
    createdAt: now,
    updatedAt: now,
  };

  let githubPinged = false;
  if (isGitHubFeedbackConfigured(env)) {
    const ghIssue = await createGitHubIssueForTicket(
      ticket,
      ['user-feedback', 'needs-approval', type === 'bug' ? 'bug' : 'enhancement'],
      env
    );
    if (ghIssue) {
      ticket.githubIssueNumber = ghIssue.number;
      ticket.githubIssueUrl = ghIssue.url;
      githubPinged = true;
    }
  }

  await saveTicketRecord(ticket, true, env);
  return { ok: true, ticket: toPublicTicket(ticket), githubPinged };
}

export async function upvoteFeedbackTicket(
  ticketId: string,
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): Promise<
  | { ok: true; ticket: PublicFeedbackTicket; alreadyVoted: boolean }
  | { ok: false; status: number; error: string }
> {
  const ticket = await getTicketById(ticketId, env);
  if (!ticket) {
    return { ok: false, status: 404, error: 'Ticket not found.' };
  }

  const ip = extractClientIp(headers);
  const guardKey = `zuki-expo:ticket-vote:${ticket.id}:${ip}`;

  if (hasDurableUserStore(env)) {
    try {
      const res = await redisPipeline([['SET', guardKey, '1', 'EX', 60 * 60 * 24 * 30, 'NX']], env);
      const setOk = res?.[0]?.result === 'OK';
      if (!setOk) {
        return { ok: true, ticket: toPublicTicket(ticket), alreadyVoted: true };
      }
    } catch {
      // allow vote on transient redis guard error
    }
  } else {
    if (memoryVoteGuards.has(guardKey)) {
      return { ok: true, ticket: toPublicTicket(ticket), alreadyVoted: true };
    }
    memoryVoteGuards.set(guardKey, Date.now());
  }

  ticket.votes += 1;
  ticket.updatedAt = Date.now();
  await saveTicketRecord(ticket, false, env);
  return { ok: true, ticket: toPublicTicket(ticket), alreadyVoted: false };
}

export async function reviewFeedbackTicket(
  params: {
    ticketId: string;
    decision: 'approve' | 'decline' | 'complete';
    adminName: string;
    adminNote?: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<
  | { ok: true; ticket: PublicFeedbackTicket; agentTriggered: boolean }
  | { ok: false; status: number; error: string }
> {
  const ticket = await getTicketById(params.ticketId, env);
  if (!ticket) {
    return { ok: false, status: 404, error: 'Ticket not found.' };
  }

  const adminNote = cleanMultiline(params.adminNote, 600) || undefined;
  const adminName = cleanSingleLine(params.adminName, 80) || 'Admin';
  let agentTriggered = false;

  if (params.decision === 'approve') {
    ticket.status = 'approved';
    ticket.adminNote = adminNote;
    ticket.reviewedBy = adminName;
    ticket.reviewedAt = Date.now();
    ticket.updatedAt = Date.now();

    if (isGitHubFeedbackConfigured(env)) {
      // If the GitHub issue was not created at submit time, create it now with agent-approved
      if (!ticket.githubIssueNumber) {
        const created = await createGitHubIssueForTicket(
          ticket,
          ['user-feedback', 'agent-approved', ticket.type === 'bug' ? 'bug' : 'enhancement'],
          env
        );
        if (created) {
          ticket.githubIssueNumber = created.number;
          ticket.githubIssueUrl = created.url;
          agentTriggered = true;
        }
      } else {
        const issueNum = ticket.githubIssueNumber;
        // Post approval note first so Gemini agent can read it
        const commentLines = [
          `✅ **Approved by ${adminName}** via PilotStand Feedback Board — pinging Gemini Cloud Agent.`,
        ];
        if (adminNote) {
          commentLines.push('', `**Owner guidance:** ${adminNote}`);
        }
        await githubFetch(
          `/issues/${issueNum}/comments`,
          { method: 'POST', body: JSON.stringify({ body: commentLines.join('\n') }) },
          env
        );

        // Remove needs-approval label (ignore 404 if already removed)
        await githubFetch(
          `/issues/${issueNum}/labels/${encodeURIComponent('needs-approval')}`,
          { method: 'DELETE' },
          env
        );

        // Add agent-approved label (triggers .github/workflows/gemini-ticket-agent.yml)
        const labelResp = await githubFetch(
          `/issues/${issueNum}/labels`,
          { method: 'POST', body: JSON.stringify({ labels: ['agent-approved'] }) },
          env
        );
        if (labelResp && labelResp.ok) {
          agentTriggered = true;
        }
      }
    }
  } else if (params.decision === 'decline') {
    ticket.status = 'declined';
    ticket.adminNote = adminNote;
    ticket.reviewedBy = adminName;
    ticket.reviewedAt = Date.now();
    ticket.updatedAt = Date.now();

    if (isGitHubFeedbackConfigured(env) && ticket.githubIssueNumber) {
      const issueNum = ticket.githubIssueNumber;
      const commentBody = adminNote
        ? `❌ **Declined by ${adminName}** via PilotStand Feedback Board.\n\n**Note:** ${adminNote}`
        : `❌ **Declined by ${adminName}** via PilotStand Feedback Board.`;
      await githubFetch(
        `/issues/${issueNum}/comments`,
        { method: 'POST', body: JSON.stringify({ body: commentBody }) },
        env
      );
      await githubFetch(
        `/issues/${issueNum}/labels/${encodeURIComponent('needs-approval')}`,
        { method: 'DELETE' },
        env
      );
      await githubFetch(
        `/issues/${issueNum}`,
        { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }) },
        env
      );
    }
  } else {
    ticket.status = 'completed';
    if (adminNote) ticket.adminNote = adminNote;
    ticket.reviewedBy = adminName;
    ticket.reviewedAt = Date.now();
    ticket.updatedAt = Date.now();

    if (isGitHubFeedbackConfigured(env) && ticket.githubIssueNumber) {
      await githubFetch(
        `/issues/${ticket.githubIssueNumber}`,
        { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) },
        env
      );
    }
  }

  await saveTicketRecord(ticket, false, env);
  return { ok: true, ticket: toPublicTicket(ticket), agentTriggered };
}

interface GitHubIssueSummary {
  number: number;
  state: 'open' | 'closed';
  state_reason?: string | null;
  labels?: Array<{ name?: string } | string>;
  body?: string | null;
}

function extractPrUrlFromText(text: string): string | undefined {
  const match = text.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
  return match?.[0];
}

export async function syncTicketsWithGitHub(
  tickets: FeedbackTicketRecord[],
  env: NodeJS.ProcessEnv = process.env,
  force = false
): Promise<FeedbackTicketRecord[]> {
  if (!isGitHubFeedbackConfigured(env) || tickets.length === 0) return tickets;
  const now = Date.now();
  if (!force && now - lastGitHubSyncAt < GITHUB_SYNC_TTL_MS) {
    return tickets;
  }

  const linkedByIssue = new Map<number, FeedbackTicketRecord>();
  for (const t of tickets) {
    if (t.githubIssueNumber) linkedByIssue.set(t.githubIssueNumber, t);
  }
  if (linkedByIssue.size === 0) return tickets;

  try {
    lastGitHubSyncAt = now;
    const resp = await githubFetch(
      '/issues?labels=user-feedback&state=all&per_page=50&sort=updated&direction=desc',
      { method: 'GET' },
      env
    );
    if (!resp || !resp.ok) return tickets;
    const issues = (await resp.json()) as GitHubIssueSummary[];
    if (!Array.isArray(issues)) return tickets;

    for (const issue of issues) {
      const ticket = linkedByIssue.get(issue.number);
      if (!ticket) continue;

      const labelNames = new Set(
        (issue.labels || [])
          .map((l) => (typeof l === 'string' ? l : l?.name || '').toLowerCase())
          .filter(Boolean)
      );

      let nextStatus: TicketStatus = ticket.status;
      if (issue.state === 'closed') {
        nextStatus =
          issue.state_reason === 'not_planned' || labelNames.has('wontfix')
            ? 'declined'
            : 'completed';
      } else if (labelNames.has('agent-pr-ready')) {
        nextStatus = 'pr_ready';
      } else if (labelNames.has('agent-working')) {
        nextStatus = 'in_progress';
      } else if (labelNames.has('agent-approved')) {
        nextStatus = 'approved';
      }

      let nextPrUrl = ticket.githubPrUrl;
      if ((nextStatus === 'pr_ready' || nextStatus === 'completed') && !nextPrUrl) {
        // Check issue comments for the Draft PR link posted by the agent workflow
        const commentsResp = await githubFetch(
          `/issues/${issue.number}/comments?per_page=10`,
          { method: 'GET' },
          env
        );
        if (commentsResp && commentsResp.ok) {
          const comments = (await commentsResp.json()) as Array<{ body?: string }>;
          for (let i = comments.length - 1; i >= 0; i--) {
            const found = extractPrUrlFromText(comments[i]?.body || '');
            if (found) {
              nextPrUrl = found;
              break;
            }
          }
        }
      }

      if (nextStatus !== ticket.status || nextPrUrl !== ticket.githubPrUrl) {
        ticket.status = nextStatus;
        if (nextPrUrl) ticket.githubPrUrl = nextPrUrl;
        ticket.updatedAt = Date.now();
        await saveTicketRecord(ticket, false, env);
      }
    }
  } catch (err) {
    console.error('[ticketStore] GitHub sync error:', err);
  }

  return tickets;
}

export async function listPublicFeedbackTickets(
  limit = 100,
  env: NodeJS.ProcessEnv = process.env,
  options?: { syncGitHub?: boolean; forceSync?: boolean }
): Promise<PublicFeedbackTicket[]> {
  const tickets = await listRawTickets(limit, env);
  if (options?.syncGitHub !== false) {
    await syncTicketsWithGitHub(tickets, env, Boolean(options?.forceSync));
  }
  return tickets.map(toPublicTicket);
}
