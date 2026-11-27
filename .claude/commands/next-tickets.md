---
description: Implement the given tickets (GitHub issues) one by one, with independent review for each ticket
argument-hint: "<issues link and issue numbers, e.g. 9 10 12>"
---

Issues: $ARGUMENTS

If the issues above are empty, ask the user which issues to implement. Follow the user's instructions about unattended work and merging; a list of tickets alone is not permission to merge.

Complete the tickets one by one, in the order given. Prefer a separate implementation agent per ticket (Claude Opus when available). If delegation is unavailable, implement sequentially yourself, retaining the independent-review requirement and fallbacks in `implement-ticket.md`. Use available coordination tools; no specific model or agent API is required.

If the user explicitly requested unattended execution, make routine implementation choices within the authorized scope. Do not invent approval for new scope, product decisions, credentials, external resources or merging. Leave blocked work open and report what is needed.

For each ticket:

1. Fetch the remote and verify its default branch (currently `master`). Start from the latest `origin/<base>` in a clean checkout or isolated worktree, preserving unrelated work.
2. Have the implementation agent, or yourself if delegation is unavailable, read `.claude/commands/implement-ticket.md` and follow it. Delegated agents should report questions and findings to the coordinator and leave merging to it.
3. Resolve routine choices within the user's authorized scope. Relay decisions through an available communication tool, document them in the PR, and follow the review loop in `implement-ticket.md`. Decisions needing the user remain unresolved unless the user delegated them explicitly.
4. If merging is authorized, merge only after the checks and independent review required by `implement-ticket.md` pass and blocking findings are resolved. Prefer `gh pr merge <number> --merge`, or an equivalent GitHub tool. Fetch again so the next ticket starts from the merged default branch. Without merge authorization, leave the PR open.
   - If the agent found the ticket already fixed and only commented on the issue, there is no PR to merge. Count the ticket as done.

Finish handling each ticket before starting the next. If a PR must remain open, start independent tickets from the remote default branch and leave dependent tickets blocked; do not silently stack them on unmerged work. The run keeps going until all the tickets are handled. If a ticket truly can't go further without the user (for example, it needs an account or a secret), leave its PR open, list it for the final summary, preserve its branch, and continue with independent tickets from the default branch.

When you're done, give the user:
- a summary of each ticket, with the PR or issue link
- each judgement call you made, with the options you weighed
- anything that blocked you
