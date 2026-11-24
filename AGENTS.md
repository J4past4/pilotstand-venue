# Agent Workflow Instructions

This repository (`J4past4/exhibition-stand-`) is often developed across multiple parallel AI agent chats. Merging and deploying are **fully automated via a serialized GitHub Actions Merge Queue** and **Vercel**. Follow these rules on every task so parallel chats never overwrite each other or break `main`.

## Permanent Git, PR & Auto-Merge Queue Workflow

1. **Always pull the latest `main` first** before starting work:
   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   ```
2. **Never commit, push, or manually merge directly to `main`.** Always create a descriptive branch for your task:
   - Features: `feat/<short-topic>`
   - Bug fixes: `fix/<short-topic>`
   - Docs / chores: `docs/<short-topic>` or `chore/<short-topic>`
3. **Verify locally before pushing.** Run the project checks and confirm they pass:
   ```bash
   npm run lint
   npm run build
   ```
4. **Commit, push, and open a Pull Request automatically** once a task is complete (or when wrapping up a milestone):
   - Push the branch to `origin`: `git push -u origin <branch-name>`
   - Open a Pull Request targeting `main`:
     ```bash
     gh pr create --base main --head <branch-name> --title "..." --body "..."
     ```
   - Include a brief summary of what changed, how it was verified, and any new environment variables needed (keep `.env.example` updated).
5. **Let the Automatic Merge Queue handle merging & deployment:**
   - Every non-draft PR targeting `main` automatically enters `.github/workflows/auto-merge-queue.yml`.
   - The queue is **strictly serialized** (`concurrency: merge-queue-main`, FIFO order): it merges each PR onto the *latest* `main`, runs `npm ci`, `npm run lint`, and `npm run build` on the combined tree, squash-merges into `main`, and deletes the branch.
   - Vercel automatically deploys `main` and supersedes intermediate in-flight builds when multiple PRs drain together.
6. **Holding PRs during a coordinated multi-chat push (optional):**
   - If you do **not** want a PR to auto-merge yet (e.g., work-in-progress or waiting on another chat), open it as a **Draft PR** (`gh pr create --draft ...`) or add the `hold` label (`gh pr edit <num> --add-label hold`).
   - Marking it ready for review or removing the `hold` label automatically puts it into the merge queue.
7. **Handling conflicts or CI failures from the queue:**
   - If the merge queue labels a PR `needs-rebase` or `ci-failed`, fetch `origin/main`, merge `origin/main` into your branch, fix any conflicts/errors, verify `npm run lint && npm run build`, and push.
   - Pushing a new commit automatically clears the failure label and re-queues the PR.
8. **Never leave finished work uncommitted or unpushed** inside a local chat VM.

## Vercel Operations (via GitHub Actions)

Vercel credentials (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) are stored in GitHub Actions Secrets and exposed safely through `.github/workflows/vercel-ops.yml`:

- Check Vercel project status, configured env key names (never values), and recent deployments:
  ```bash
  gh workflow run vercel-ops.yml -f action=status
  ```
- Set a **non-secret** Vercel env var (e.g., `APP_ACCESS_MODE=public`) and redeploy production:
  ```bash
  gh workflow run vercel-ops.yml -f action=set-env -f env_key=APP_ACCESS_MODE -f env_value=public -f targets=production,preview -f redeploy_after=true
  ```
- Trigger a production redeploy:
  ```bash
  gh workflow run vercel-ops.yml -f action=redeploy
  ```
- **Never** pass API keys, passwords, or tokens via workflow inputs — keep real secrets in the Vercel Dashboard only.

