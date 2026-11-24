#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const eventName = process.env.GITHUB_EVENT_NAME ?? '';
const eventPath = process.env.GITHUB_EVENT_PATH ?? '';
const summaryPath = process.env.GITHUB_STEP_SUMMARY ?? '';
const dryRun = process.env.DRY_RUN === 'true';

if (!token || !repo) {
  console.error('Missing required GITHUB_TOKEN or GITHUB_REPOSITORY environment variables.');
  process.exit(1);
}

const API_BASE = `https://api.github.com/repos/${repo}`;
const HOLD_LABELS = new Set(['hold', 'do-not-merge']);
const BLOCKED_LABELS = new Set(['needs-rebase', 'ci-failed']);

async function ghApi(path, { method = 'GET', body, allowStatuses = [] } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok && !allowStatuses.includes(response.status)) {
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return { status: response.status, ok: response.ok, data };
}

function runCmd(cmd, args, { allowFail = false } = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: stdout };
  } catch (err) {
    const stdout = err.stdout ? String(err.stdout) : '';
    const stderr = err.stderr ? String(err.stderr) : '';
    const output = `${stdout}\n${stderr}`.trim();
    if (!allowFail) {
      throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${output}`);
    }
    return { ok: false, output };
  }
}

function getLockfileHash() {
  const hash = createHash('sha256');
  for (const file of ['package.json', 'package-lock.json']) {
    if (existsSync(file)) {
      hash.update(readFileSync(file));
    }
  }
  return hash.digest('hex');
}

function trimLog(output, maxLines = 45) {
  const lines = output.split(/\r?\n/);
  if (lines.length <= maxLines) return output;
  return `... (truncated ${lines.length - maxLines} lines) ...\n${lines.slice(-maxLines).join('\n')}`;
}

async function addLabel(prNumber, label) {
  await ghApi(`/issues/${prNumber}/labels`, {
    method: 'POST',
    body: { labels: [label] },
    allowStatuses: [422],
  });
}

async function removeLabel(prNumber, label) {
  await ghApi(`/issues/${prNumber}/labels/${encodeURIComponent(label)}`, {
    method: 'DELETE',
    allowStatuses: [404],
  });
}

async function postComment(prNumber, body) {
  await ghApi(`/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body },
  });
}

async function clearRetryLabelsIfUpdated() {
  if (eventName !== 'pull_request' || !eventPath || !existsSync(eventPath)) return;
  const payload = JSON.parse(readFileSync(eventPath, 'utf8'));
  const action = payload.action;
  const pr = payload.pull_request;
  if (!pr?.number) return;

  if (action === 'synchronize' || action === 'ready_for_review' || action === 'reopened') {
    const existing = new Set((pr.labels ?? []).map((l) => l.name));
    for (const label of BLOCKED_LABELS) {
      if (existing.has(label)) {
        console.log(`PR #${pr.number} updated (${action}); clearing '${label}' label to re-enter queue.`);
        await removeLabel(pr.number, label);
      }
    }
  }
}

function writeSummary(results) {
  if (!summaryPath) return;
  const lines = [
    '## Merge Queue Summary',
    '',
    results.length === 0
      ? '_No eligible pull requests were waiting in the queue._'
      : '| PR | Branch | Status | Details |',
  ];
  if (results.length > 0) {
    lines.push('| --- | --- | --- | --- |');
    for (const r of results) {
      lines.push(`| #${r.number} | \`${r.branch}\` | ${r.status} | ${r.detail} |`);
    }
  }
  lines.push('');
  appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

async function main() {
  runCmd('git', ['config', 'user.name', 'github-actions[bot]']);
  runCmd('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);

  await clearRetryLabelsIfUpdated();

  const { data: openPrs } = await ghApi(
    '/pulls?state=open&base=main&sort=created&direction=asc&per_page=50',
  );

  const results = [];
  let installedLockHash = existsSync('node_modules') ? getLockfileHash() : null;

  for (const prSummary of openPrs) {
    const prNumber = prSummary.number;
    const headRef = prSummary.head.ref;

    if (prSummary.draft) {
      results.push({ number: prNumber, branch: headRef, status: 'Skipped', detail: 'Draft PR' });
      continue;
    }

    if (prSummary.head.repo?.full_name !== repo) {
      results.push({ number: prNumber, branch: headRef, status: 'Skipped', detail: 'External fork PR' });
      continue;
    }

    const labelNames = new Set((prSummary.labels ?? []).map((l) => l.name));
    if ([...HOLD_LABELS].some((l) => labelNames.has(l))) {
      results.push({ number: prNumber, branch: headRef, status: 'Held', detail: 'Has hold/do-not-merge label' });
      continue;
    }
    if ([...BLOCKED_LABELS].some((l) => labelNames.has(l))) {
      results.push({
        number: prNumber,
        branch: headRef,
        status: 'Waiting',
        detail: 'Waiting for new push to resolve previous failure/conflict',
      });
      continue;
    }

    // Re-fetch latest PR state right before testing
    const { data: pr } = await ghApi(`/pulls/${prNumber}`);
    if (pr.state !== 'open' || pr.draft) {
      results.push({ number: prNumber, branch: headRef, status: 'Skipped', detail: 'Closed or converted to draft' });
      continue;
    }

    const headSha = pr.head.sha;
    console.log(`\n=== Processing PR #${prNumber} (${headRef} @ ${headSha.slice(0, 7)}) ===`);

    runCmd('git', ['fetch', 'origin', 'main']);
    const fetchHead = runCmd('git', ['fetch', 'origin', headRef], { allowFail: true });
    if (!fetchHead.ok) {
      results.push({ number: prNumber, branch: headRef, status: 'Skipped', detail: 'Head branch no longer exists' });
      continue;
    }

    runCmd('git', ['checkout', '-B', 'queue-test', 'origin/main']);
    const mergeResult = runCmd('git', ['merge', '--no-edit', '--no-ff', 'FETCH_HEAD'], { allowFail: true });

    if (!mergeResult.ok) {
      runCmd('git', ['merge', '--abort'], { allowFail: true });
      console.log(`PR #${prNumber} has merge conflicts with main.`);
      await addLabel(prNumber, 'needs-rebase');
      await postComment(
        prNumber,
        [
          '⚠️ **Merge Queue: Merge conflict with `main`**',
          '',
          'This PR cannot be merged cleanly onto the latest `main`. Please update your branch (`git fetch origin && git merge origin/main`), resolve conflicts, verify `npm run lint && npm run build`, and push.',
          '',
          'Once you push a new commit, the `needs-rebase` label will clear and this PR will automatically re-enter the merge queue.',
        ].join('\n'),
      );
      results.push({ number: prNumber, branch: headRef, status: 'Conflict', detail: 'Labeled `needs-rebase`' });
      continue;
    }

    const currentLockHash = getLockfileHash();
    if (currentLockHash !== installedLockHash || !existsSync('node_modules')) {
      console.log('Installing dependencies with npm ci...');
      const ciRes = runCmd('npm', ['ci'], { allowFail: true });
      if (!ciRes.ok) {
        await addLabel(prNumber, 'ci-failed');
        await postComment(
          prNumber,
          `❌ **Merge Queue: \`npm ci\` failed** when merged with latest \`main\`.\n\n\`\`\`\n${trimLog(ciRes.output)}\n\`\`\`\n\nPush a fix to automatically re-enter the merge queue.`,
        );
        results.push({ number: prNumber, branch: headRef, status: 'Failed', detail: '`npm ci` failed' });
        installedLockHash = null;
        continue;
      }
      installedLockHash = currentLockHash;
    }

    console.log('Running npm run lint...');
    const lintRes = runCmd('npm', ['run', 'lint'], { allowFail: true });
    if (!lintRes.ok) {
      await addLabel(prNumber, 'ci-failed');
      await postComment(
        prNumber,
        `❌ **Merge Queue: \`npm run lint\` failed** when merged with latest \`main\`.\n\n\`\`\`\n${trimLog(lintRes.output)}\n\`\`\`\n\nPush a fix to automatically re-enter the merge queue.`,
      );
      results.push({ number: prNumber, branch: headRef, status: 'Failed', detail: '`npm run lint` failed' });
      continue;
    }

    console.log('Running npm run build...');
    const buildRes = runCmd('npm', ['run', 'build'], { allowFail: true });
    if (!buildRes.ok) {
      await addLabel(prNumber, 'ci-failed');
      await postComment(
        prNumber,
        `❌ **Merge Queue: \`npm run build\` failed** when merged with latest \`main\`.\n\n\`\`\`\n${trimLog(buildRes.output)}\n\`\`\`\n\nPush a fix to automatically re-enter the merge queue.`,
      );
      results.push({ number: prNumber, branch: headRef, status: 'Failed', detail: '`npm run build` failed' });
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] PR #${prNumber} passed lint & build and is ready to squash-merge.`);
      results.push({ number: prNumber, branch: headRef, status: 'Dry-run OK', detail: 'Passed lint & build' });
      continue;
    }

    // Squash-merge into main with atomic SHA check
    const mergeApi = await ghApi(`/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: {
        merge_method: 'squash',
        sha: headSha,
        commit_title: `${pr.title} (#${prNumber})`,
      },
      allowStatuses: [403, 405, 409, 422],
    });

    if (!mergeApi.ok) {
      const apiMsg =
        typeof mergeApi.data === 'object' && mergeApi.data?.message
          ? String(mergeApi.data.message)
          : String(mergeApi.data ?? '');

      if (mergeApi.status === 403 || apiMsg.toLowerCase().includes('workflow')) {
        console.log(`PR #${prNumber} modifies GitHub Actions workflows and requires manual merge.`);
        await addLabel(prNumber, 'hold');
        await postComment(
          prNumber,
          '🔒 **Merge Queue: Manual merge required**\n\nThis PR modifies `.github/workflows/`, which GitHub prevents `GITHUB_TOKEN` from auto-merging for security. Lint & build passed — please merge this PR manually.',
        );
        results.push({
          number: prNumber,
          branch: headRef,
          status: 'Manual',
          detail: 'Modifies `.github/workflows/`; passed checks, needs manual merge',
        });
        continue;
      }

      const { data: refreshed } = await ghApi(`/pulls/${prNumber}`);
      if (refreshed.head.sha !== headSha) {
        console.log(`PR #${prNumber} received new commits during build; deferring to next queued run.`);
        results.push({
          number: prNumber,
          branch: headRef,
          status: 'Deferred',
          detail: 'New commits pushed mid-build; will retry automatically',
        });
      } else {
        console.log(`PR #${prNumber} could not be merged via API (${mergeApi.status}): ${apiMsg}`);
        await addLabel(prNumber, 'needs-rebase');
        results.push({
          number: prNumber,
          branch: headRef,
          status: 'Conflict',
          detail: `GitHub merge rejected (${mergeApi.status})`,
        });
      }
      continue;
    }

    console.log(`✅ Squash-merged PR #${prNumber} into main!`);

    // Best-effort branch cleanup (in addition to repo delete_branch_on_merge setting)
    await ghApi(`/git/refs/heads/${encodeURIComponent(headRef)}`, {
      method: 'DELETE',
      allowStatuses: [404, 422],
    });

    results.push({
      number: prNumber,
      branch: headRef,
      status: 'Merged',
      detail: 'Squash-merged to `main` (Vercel deploy triggered)',
    });
  }

  writeSummary(results);
  console.log('\nMerge queue run complete:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
