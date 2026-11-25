import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearInMemoryTicketStore,
  createFeedbackTicket,
  listPublicFeedbackTickets,
  reviewFeedbackTicket,
  upvoteFeedbackTicket,
} from '../../api/_lib/ticketStore';

describe('ticketStore', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearInMemoryTicketStore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('validates title, description, and optional email on creation', async () => {
    const shortTitle = await createFeedbackTicket(
      { type: 'bug', title: 'Hi', description: 'This is a long enough description.' },
      {}
    );
    expect(shortTitle.ok).toBe(false);

    const shortDesc = await createFeedbackTicket(
      { type: 'bug', title: 'Valid bug title', description: 'Too short' },
      {}
    );
    expect(shortDesc.ok).toBe(false);

    const badEmail = await createFeedbackTicket(
      {
        type: 'improvement',
        title: 'Add dark mode toggle',
        description: 'Would love a dark mode switch in the top bar.',
        reporterEmail: 'not-an-email',
      },
      {}
    );
    expect(badEmail.ok).toBe(false);
  });

  it('creates a ticket, strips reporterEmail from public projection, and guards duplicate upvotes', async () => {
    const created = await createFeedbackTicket(
      {
        type: 'improvement',
        title: 'Add 2D keyboard shortcut',
        description: 'Pressing 2 should toggle top-down 2D plan view immediately.',
        area: '3d-viewport',
        priority: 'high',
        reporterName: 'Alex',
        reporterEmail: 'alex@example.com',
        context: { viewMode: '3d', standSize: '4×3m', itemCount: 5 },
      },
      {}
    );

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.githubPinged).toBe(false);
    expect(created.ticket.status).toBe('pending_approval');
    expect(created.ticket.votes).toBe(1);
    expect('reporterEmail' in created.ticket).toBe(false);

    const list = await listPublicFeedbackTickets(50, {}, { syncGitHub: false });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Add 2D keyboard shortcut');

    // First upvote from IP 1.2.3.4 increments votes
    const vote1 = await upvoteFeedbackTicket(created.ticket.id, { 'x-forwarded-for': '1.2.3.4' }, {});
    expect(vote1.ok).toBe(true);
    if (vote1.ok) {
      expect(vote1.alreadyVoted).toBe(false);
      expect(vote1.ticket.votes).toBe(2);
    }

    // Second upvote from same IP is ignored
    const vote2 = await upvoteFeedbackTicket(created.ticket.id, { 'x-forwarded-for': '1.2.3.4' }, {});
    expect(vote2.ok).toBe(true);
    if (vote2.ok) {
      expect(vote2.alreadyVoted).toBe(true);
      expect(vote2.ticket.votes).toBe(2);
    }
  });

  it('creates a GitHub Issue on submit and adds agent-approved label on admin confirmation', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';

      if (url.endsWith('/issues') && method === 'POST') {
        return new Response(
          JSON.stringify({
            number: 42,
            html_url: 'https://github.com/J4past4/exhibition-stand-/issues/42',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/issues/42/comments') && method === 'POST') {
        return new Response(JSON.stringify({ id: 1 }), { status: 201 });
      }
      if (url.includes('/issues/42/labels/needs-approval') && method === 'DELETE') {
        return new Response(null, { status: 200 });
      }
      if (url.endsWith('/issues/42/labels') && method === 'POST') {
        return new Response(JSON.stringify([{ name: 'agent-approved' }]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      GITHUB_FEEDBACK_TOKEN: 'ghp_test_token',
      GITHUB_FEEDBACK_REPO: 'J4past4/exhibition-stand-',
    };

    const created = await createFeedbackTicket(
      {
        type: 'bug',
        title: 'Lighting preset resets on reload',
        description: 'Selecting Keynote lighting resets back to Expo Hall after page refresh.',
        area: '3d-viewport',
      },
      env
    );

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.githubPinged).toBe(true);
    expect(created.ticket.githubIssueNumber).toBe(42);
    expect(created.ticket.githubIssueUrl).toBe(
      'https://github.com/J4past4/exhibition-stand-/issues/42'
    );

    const approved = await reviewFeedbackTicket(
      {
        ticketId: created.ticket.id,
        decision: 'approve',
        adminName: 'James',
        adminNote: 'Persist lightingPreset in localStorage project config.',
      },
      env
    );

    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.agentTriggered).toBe(true);
    expect(approved.ticket.status).toBe('approved');
    expect(approved.ticket.reviewedBy).toBe('James');

    // Verify agent-approved label was added
    const labelCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/issues/42/labels') && init?.method === 'POST'
    );
    expect(labelCall).toBeTruthy();
    expect(String(labelCall?.[1]?.body)).toContain('agent-approved');
  });

  it('syncs live PR-ready status and Draft PR URL back from GitHub Issues', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';

      if (url.endsWith('/issues') && method === 'POST') {
        return new Response(
          JSON.stringify({
            number: 77,
            html_url: 'https://github.com/J4past4/exhibition-stand-/issues/77',
          }),
          { status: 201 }
        );
      }
      if (url.includes('/issues?labels=user-feedback') && method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              number: 77,
              state: 'open',
              labels: [{ name: 'user-feedback' }, { name: 'agent-pr-ready' }],
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes('/issues/77/comments') && method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              body: '✅ Draft PR ready: https://github.com/J4past4/exhibition-stand-/pull/88',
            },
          ]),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const env = {
      GITHUB_FEEDBACK_TOKEN: 'ghp_test_token',
      GITHUB_FEEDBACK_REPO: 'J4past4/exhibition-stand-',
    };

    const created = await createFeedbackTicket(
      {
        type: 'improvement',
        title: 'Add grid snap increment selector',
        description: 'Allow choosing 0.1m, 0.25m, or 0.5m snap steps in the View popover.',
      },
      env
    );
    expect(created.ok).toBe(true);

    const synced = await listPublicFeedbackTickets(50, env, { syncGitHub: true, forceSync: true });
    expect(synced).toHaveLength(1);
    expect(synced[0].status).toBe('pr_ready');
    expect(synced[0].githubPrUrl).toBe('https://github.com/J4past4/exhibition-stand-/pull/88');
  });
});
