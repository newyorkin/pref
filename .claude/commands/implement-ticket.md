# Implement a ticket

You are implementing one ticket for the preferans game in this repo. A ticket is a GitHub issue in the repo's `origin`.

## 1. Start from the latest `origin/master`

- Run `git status`. If there are uncommitted changes or you're on a branch other than `master`, stop and tell the user.
- Run `git fetch origin`. Merges usually happen on GitHub, so local branches may be out of date.
- Create the ticket branch from `origin/master`: `git switch -c claude/<issue number>-<short-slug> origin/master`, for example `claude/9-dim-unplayable-cards`. Then run `pnpm install`.

## 2. Read the ticket

- Read the issue with `gh issue view <issue number>`, including its comments (`--comments`).
- Read `README.md` and `docs/roadmap.md`.
- Read the code the ticket touches, and enough of the code around it to follow its conventions.

## 3. Check the ticket is still needed

Tickets were written from chat feedback and may already be fixed on `origin/master`. Before writing any code, check each item in the "Что проверить и сделать" list against the current code, and reproduce the problem in the running app where you can. To reproduce it, use the screenshot tool as the checks under "Before you finish" describe, with `--out /tmp/pref-screenshots/<issue number>-before/`. `pnpm dev` doesn't work for the test table.

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
   - For visible changes, take screenshots of the fix on the local test table with `.claude/tools/screenshot.mjs`. The comment at the top of that file explains how to start the server and write a scenario. Use `pnpm --filter @pref/web build` and the server start command it gives, not `pnpm dev`. Write the scenario to `/tmp/pref-scenarios/<issue number>.mjs`, outside the repo. Before the run whose screenshots you'll publish, delete `/tmp/pref-screenshots/<issue number>/` so no old screenshots are left there. Then run `node .claude/tools/screenshot.mjs /tmp/pref-scenarios/<issue number>.mjs --out /tmp/pref-screenshots/<issue number>/`. Take one screenshot for each state the ticket's checklist names, from each player's view where it differs. Look at every screenshot yourself, and describe what each one shows under `### Testing`. If you can't take a screenshot, list the visual check under `### Not verified`, with the reason. When you're done, stop the app server on port 3001. Leave the `pref-playwright` Docker container running for the next run.
2. Commit on the ticket branch.
3. Push the branch with `git push -u origin <branch>`.
4. Open a pull request into `master` with `gh pr create`. Don't merge it. Write the PR in English, and put `Closes #<issue number>` at the end of the description so that merging closes the issue.
   - Title: `<issue number>: <issue title without the [P…] prefix>`, for example `9: Затемнять карты, которыми нельзя ходить`.
   - Description, with these sections (leave out any that would be empty):
     - `## <issue number>: <issue title without the [P…] prefix>`, then one or two sentences on what the PR does
     - `### What's included`: what was built, with new files and changed behavior
     - `### Choices the ticket doesn't settle`: decisions you made where the ticket or docs were silent
     - `### How to run`
     - `### Testing`: commands run and their results
     - `### Screenshots`: the screenshots of the fix, each with a one-line caption. Publish them with `.claude/tools/publish-screenshots.sh <issue number> /tmp/pref-screenshots/<issue number>/*.png`, which pushes them to the `pr-screenshots` branch and prints a Markdown image line for each. Paste those lines here. If you retake screenshots after review fixes, publish them again and replace the lines with `gh pr edit`.
     - `### Acceptance criteria`: each item from the "Что проверить и сделать" list as a checkbox, ticked if it passed, or unticked with the reason
     - `### Not verified`: anything you couldn't check, and why
     - `### Docs changed`: each change to `README.md`, `docs/roadmap.md` or other docs, and why
     - `### Docs that may be wrong`: anything in the docs you think is wrong but didn't change
5. Get the PR reviewed by a new agent. Use the Agent tool with a fresh agent, not a fork, so the reviewer doesn't share your view of the code. Set `model: "opus"` so the review runs on the latest Opus model. Tell it the PR number and issue number, and ask it to:
   - read the issue, `README.md`, `docs/roadmap.md`, the diff (`gh pr diff <number>`) and the code around the changed lines
   - open each screenshot in `/tmp/pref-screenshots/<issue number>/` with the Read tool, compare them with the PR's `### Screenshots` section, and check that they show each item in the ticket's checklist working
   - look for bugs, missed acceptance criteria, missing tests, breaks from the existing code's conventions, in-app strings or game terms not in Russian, and work outside the ticket
   - report each issue with its file and line, without changing any files
   - mark each issue as **obvious** (one clear fix within the ticket) or **judgement call** (more than one reasonable fix, behavior the ticket and docs don't settle, work that may belong to another ticket, or a change to `README.md` or `docs/roadmap.md` that isn't clearly needed)
   - post each issue on the PR as a separate comment, starting with its mark (**Obvious** or **Judgement call**). Post it as an inline comment on its file and line with `gh api repos/{owner}/{repo}/pulls/<number>/comments` (fields `body`, `commit_id` set to the PR's head commit, `path`, `line`, `side=RIGHT`). If the line isn't part of the diff, post it as a general comment with `gh pr comment <number>`.
   - return the issues to you as well, each with the ID or URL of its PR comment
6. Go through the review:
   - Fix each obvious issue you agree with. Run the checks again, commit, push, and update the PR description with `gh pr edit` if the fixes change it.
   - Don't change anything for the judgement calls. Don't fix an obvious issue you think is wrong either; note your reason.
   - Reply to each review comment on the PR: what you fixed and in which commit, why you didn't fix it, or that it's a judgement call waiting for the user. Reply to an inline comment with `gh api repos/{owner}/{repo}/pulls/<number>/comments/<comment id>/replies -f body=...`, and to a general comment with `gh pr comment <number>`, quoting the issue you're answering.
   - If you made a significant change that requires another review, get another review from a fresh agent, as described above. If the fixes were small, no need for another review.
   - If the review loop hasn't settled after 3 rounds, merge the PR and tell the user in the final reply.
7. Reply with:
   - a short summary, the PR link
   - how many review rounds there were
   - the issues you chose not to fix, with your reason
   - each judgement call, with the options you see, asking the user what to do. Wait for the answer before changing anything for it.
