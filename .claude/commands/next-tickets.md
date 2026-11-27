---
description: Implement the given tickets (GitHub issues) one by one, with an Opus agent per ticket
argument-hint: "<issues link and issue numbers, e.g. 9 10 12>"
---

Issues: $ARGUMENTS

If the issues above are empty, ask the user which issues to implement. Once you have them, don't ask the user anything else.

The user isn't available during this run. Complete the tickets one by one, in the order given, without waiting for their input. Use this thread only to coordinate: you don't write code yourself.

For each ticket:

1. Make sure you're on an up-to-date `master` with a clean working tree, so the agent can start.
2. Spawn one Opus agent (`model: "opus"`) to implement it. Tell it to read `.claude/commands/implement-ticket.md` and follow it, with these changes:
   - You are its user. Whenever that file says to tell or ask the user, it asks you instead.
   - It doesn't merge the PR.
3. Answer every question the agent sends you yourself, and make each judgement call yourself. Never pass a question on to the user, and never wait for the user. Send your answers and decisions to the same agent with SendMessage. Tell it to make the changes, reply to each judgement-call comment on the PR with the decision and the commit, and get another review from a fresh agent, as the review step in `implement-ticket.md` describes. Repeat until the agent reports no open judgement calls.
4. Merge the PR with `gh pr merge <number> --merge`. Then run `git switch master` and `git pull` so the next ticket starts from the merged code.
   - If the agent found the ticket already fixed and only commented on the issue, there is no PR to merge. Count the ticket as done.

Don't start the next ticket until the previous one is merged or counted as done. The run keeps going until all the tickets are handled. If a ticket truly can't go further without the user (for example, it needs an account or a secret), leave its PR open, list it for the final summary, switch back to `master`, and go on to the next ticket.

When you're done, give the user:
- a summary of each ticket, with the PR or issue link
- each judgement call you made, with the options you weighed
- anything that blocked you
