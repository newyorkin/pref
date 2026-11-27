# Implement a ticket

You are implementing one ticket for the preferans game in this repo. A ticket is a GitHub issue in the repo's `origin`. For a task requested directly by the user, use the same workflow without inventing an issue number or a `Closes` reference.

## Tools and environment

The required outcomes are the checks, evidence and review below; the named tools are preferred ways to achieve them, not requirements for a particular model, operating system or hosting environment.

- Prefer the existing project screenshot tool with Docker, GitHub CLI (`gh`), and a fresh Claude Opus reviewer when available. Otherwise use equivalent tools available in your environment: a local or connected browser, a GitHub integration or API, and another independent agent or a human reviewer.
- Check availability and try the preferred approach when practical. If it is unavailable or fails because of the environment, switch to an equivalent approach instead of repeatedly retrying or requiring a new account, model or installation. Record the substitution and any limits under `### Testing` or `### Not verified`.
- Adapt shell syntax, environment variables and paths to the host. Use a temporary directory outside the repo (for example the OS temporary directory), with a separate task-specific subdirectory for scenarios and screenshots. Paths shown below are placeholders, not literal POSIX-only paths.
- If no equivalent method is available, report the missing check; never claim it passed. Self-review is useful but does not count as independent review.
- Follow the user's explicit instructions about scope, review and merging. Tool substitutions do not waive acceptance criteria or permission requirements.

## 1. Start from the latest default branch

- Run `git status`. Preserve existing changes. If the current checkout contains unrelated work, use an isolated worktree or checkout; ask the user only if the work cannot safely be isolated.
- Run `git fetch origin`. Merges usually happen on GitHub, so local branches may be out of date.
- Verify the remote's current default branch using GitHub metadata or `git remote show origin`; do not rely only on a possibly stale local `origin/HEAD`. This repo currently uses `master`; use it as `<base>` below unless the remote or user says otherwise.
- Create a separate task branch from `origin/<base>`, for example `git switch -c work/<issue number>-<short-slug> origin/<base>`. Any descriptive branch prefix is fine. Then run `pnpm install --frozen-lockfile`.

## 2. Read the ticket

- Read the issue with `gh issue view <issue number>`, including its comments (`--comments`), or an equivalent GitHub tool. For a direct user task, use the request and its acceptance criteria instead.
- Read `README.md` and `docs/roadmap.md`.
- Read the code the ticket touches, and enough of the code around it to follow its conventions.

## 3. Check the ticket is still needed

Tickets were written from chat feedback and may already be fixed on the current default branch. Before writing any code, check each acceptance criterion (often listed under "Что проверить и сделать") against the current code, and reproduce the problem in the running app where applicable. For visual problems, follow the browser checks below and keep before/after evidence in separate temporary directories. The local test table needs the built client served directly by the server; the Vite proxy used by `pnpm dev` rewrites Host and breaks its origin checks.

- If every item is already done, don't open a PR. Post a comment on the issue with `gh issue comment <number>` that lists each item with its evidence (the file and line or commit that handles it, the test that covers it, or what you saw when you reproduced it). Don't close the issue. Then stop, and reply with the issue link and a note that the ticket is already fixed.
- If only some items are done, implement the rest, and list the done items with their evidence in the PR description under `### Acceptance criteria`.

## 4. Implement

Implement each remaining item in the "Что проверить и сделать" list, following the rules below. Add or update tests for the behavior you change.

## 5. Rules

- Build only what the ticket lists. Don't start work that belongs to another ticket, even if it seems small.
- Don't create accounts or cloud resources. If a real service isn't available, mock it in tests and list the real check as unverified.
- Never put real secrets in the repo.
- Write all in-app strings in Russian.
- Write game-specific terms in Russian everywhere, including in the English PR text and review comments. Don't translate them. Examples: вист, распасы, мизер, снос, прикуп, пуля, гора.
- Name variables and functions the way the existing code does, including how it names game terms.

## 6. Before you finish

1. Run the checks. All must pass:
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm --filter @pref/web build`, if you changed `packages/web`
   - For visible changes, verify the affected states in a browser and take screenshots. Prefer `.claude/tools/screenshot.mjs` with its Docker browser; its header documents the server setup and scenario helpers. Build the client and serve it directly in local test mode as documented there, adapting the commands to the host. Use a separate temporary SQLite database and keep local test mode bound to loopback.
   - Put the scenario at `<temp>/pref-scenarios/<task>.mjs` and screenshots in a fresh, task-specific output directory. Run `node .claude/tools/screenshot.mjs <scenario-path> --out <screenshot-dir>`. If Docker or the tool cannot run, use a local or connected browser against the same test table and reproduce the same states. Do not expose local test mode publicly to make a browser reach it.
   - Capture each state in the acceptance criteria, from each player's view where it differs. Inspect every screenshot using an available image viewer and describe the results under `### Testing`. For changes without visible effects, screenshots are not required. If browser checks or screenshots are unavailable, list the affected checks and reason under `### Not verified`.
   - When done, stop only app servers started for this task. Prefer reusing the `pref-playwright` Docker container if available; do not stop services belonging to other work.
2. Commit on the ticket branch.
3. Push the branch with `git push -u origin <branch>`.
4. Open a pull request into `<base>` with `gh pr create` or an equivalent GitHub tool. Leave it open unless the user explicitly authorized merging. Write the PR in English, and, for an issue-backed task, put `Closes #<issue number>` at the end of the description so that merging closes the issue.
   - Title: `<issue number>: <issue title without the [P…] prefix>`, for example `9: Затемнять карты, которыми нельзя ходить`. For a direct task without an issue, use a descriptive title and omit the issue prefix from the description too.
   - Description, with these sections (leave out any that would be empty):
     - `## <issue number>: <issue title without the [P…] prefix>`, then one or two sentences on what the PR does
     - `### What's included`: what was built, with new files and changed behavior
     - `### Choices the ticket doesn't settle`: decisions you made where the ticket or docs were silent
     - `### How to run`
     - `### Testing`: commands run and their results
     - `### Screenshots`: screenshots of the fix, each with a one-line caption. Prefer `.claude/tools/publish-screenshots.sh <issue number> <screenshot-dir>/*.png` when the script and shell are available; it pushes to `pr-screenshots` and prints Markdown image links. Otherwise attach images using an available GitHub interface. If publishing is unavailable, retain local artifacts for review and disclose that limitation; do not invent public links. After retakes, update the PR images and captions.
     - `### Acceptance criteria`: each item from the "Что проверить и сделать" list as a checkbox, ticked if it passed, or unticked with the reason
     - `### Not verified`: anything you couldn't check, and why
     - `### Docs changed`: each change to `README.md`, `docs/roadmap.md` or other docs, and why
     - `### Docs that may be wrong`: anything in the docs you think is wrong but didn't change
5. Get an independent review. Prefer a fresh Claude Opus agent if available; otherwise use another available independent agent or a human reviewer. For an agent, prefer a fresh context rather than a fork, and provide the task, PR and relevant evidence without supplying your own review conclusions. If independent review is unavailable, self-review the diff, report that independent review is missing, and leave the PR open pending review. Ask the reviewer to:
   - read the issue, `README.md`, `docs/roadmap.md`, the diff (`gh pr diff <number>`) and the code around the changed lines
   - inspect each screenshot using an available image viewer, compare it with the PR's `### Screenshots` section, and check that the evidence covers the visual acceptance criteria; if local files are inaccessible, use attachments or shared artifacts, and report any evidence that cannot be inspected
   - look for bugs, missed acceptance criteria, missing tests, breaks from the existing code's conventions, in-app strings or game terms not in Russian, and work outside the ticket
   - report each issue with its file and line, without changing any files
   - mark each issue as **obvious** (one clear fix within the ticket) or **judgement call** (more than one reasonable fix, behavior the ticket and docs don't settle, work that may belong to another ticket, or a change to `README.md` or `docs/roadmap.md` that isn't clearly needed)
   - return each finding with its file, line and classification. When PR comments are authorized, post each finding separately, starting with **Obvious** or **Judgement call**, using GitHub CLI, an integration or the API. Prefer inline comments for changed lines and general comments otherwise. If the reviewer cannot publish comments, the implementer can publish the findings when authorized; otherwise retain them in the handoff.
   - return the findings to you as well, with comment IDs or URLs where published
6. Go through the review:
   - Fix each obvious issue you agree with. Run the checks again, commit, push, and update the PR description with `gh pr edit` if the fixes change it.
   - Don't change anything for the judgement calls. Don't fix an obvious issue you think is wrong either; note your reason.
   - Reply to each review comment on the PR using an available GitHub tool: what you fixed and in which commit, why you didn't fix it, or that it's a judgement call waiting for the user. Keep replies in their original threads where supported.
   - If you made a significant change that requires another review, get another review from a fresh agent, as described above. If the fixes were small, no need for another review.
   - If the review loop hasn't settled after 3 rounds, leave the PR open and summarize unresolved findings. A round limit is not a reason to merge unresolved work.
7. Merge only if explicitly authorized by the user, required checks and independent review have passed, and no blocking findings or decisions remain. Check the PR's current head and CI results before merging. In this repo, merging into `master` automatically deploys to https://pref-test.yorkin.online; include that effect when interpreting merge authorization. If deployment verification is part of the task, compare the site's version stamp with the merged commit and report the result.
8. Reply with:
   - a short summary, the PR link
   - the checks performed, tool substitutions, anything not verified, and whether it was merged
   - how many review rounds there were and whether review was independent
   - the issues you chose not to fix, with your reason
   - each judgement call, with the options you see, asking the user what to do. Wait for the answer before changing anything for it.
