# Agent Workflow Instructions

This repository (`J4past4/exhibition-stand-`) is often developed across multiple parallel AI agent chats. Follow these rules on every task so changes are never lost in an isolated VM or overwritten on `main`.

## Permanent Git & PR Workflow

1. **Always pull the latest `main` first** before starting work:
   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   ```
2. **Never commit or push directly to `main`.** Always create a descriptive branch for your task:
   - Features: `feat/<short-topic>`
   - Bug fixes: `fix/<short-topic>`
   - Docs / chores: `docs/<short-topic>` or `chore/<short-topic>`
3. **Verify before pushing.** Run the project checks and confirm they pass:
   ```bash
   npm run lint
   npm run build
   ```
4. **Commit, push, and open a Pull Request automatically** once a task is complete (or when wrapping up a milestone):
   - Push the branch to `origin`: `git push -u origin <branch-name>`
   - Open a Pull Request targeting `main` via `gh pr create --base main --head <branch-name> --title "..." --body "..."`
   - Include a brief summary of what changed, how it was verified, and any new environment variables needed (keep `.env.example` updated).
5. **Never leave finished work uncommitted or unpushed** inside a local chat VM.

---

## Temporary Instruction: Consolidate, Merge & Deploy for Testing

> **Status:** Active — remove this section once all parallel chat changes are merged into `main`, deployed, and tested by the user.

We are currently consolidating changes made across multiple chats so the user can test and deploy everything together:

1. **If you are an active chat with local/unpushed work:**
   - Check `git status` and `git log`.
   - Commit any uncommitted work to a new feature branch (e.g., `feat/<topic>`), push it to `origin`, and open a Pull Request against `main`.
2. **When merging all open PRs for testing & deployment:**
   - Fetch all remote branches and review every open PR against `main`.
   - Merge all open PRs into `main` (resolving any merge conflicts cleanly without dropping features from other PRs).
   - Run `npm install`, `npm run lint`, and `npm run build` on the merged `main` branch and fix any integration issues.
   - Verify `vercel.json` and `.env.example` are up to date so the Vercel deployment from `main` succeeds cleanly, then report the merged features and any Vercel environment variables required so the user can test the live deployment.
