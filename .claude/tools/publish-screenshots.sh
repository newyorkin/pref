#!/bin/sh
# Pushes screenshots to the orphan `pr-screenshots` branch under <issue number>/ and prints
# a Markdown image line for each one, to paste into the PR description.
# It doesn't touch the working tree, the index or the current branch.
#
# Usage: .claude/tools/publish-screenshots.sh <issue number> <file.png>...
# Set DRY_RUN=1 to build the commit without pushing it.
set -eu

issue=$1
shift
[ $# -gt 0 ] || { echo "Usage: $0 <issue number> <file.png>..." >&2; exit 2; }

branch=pr-screenshots
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
index=$(mktemp)
trap 'rm -f "$index"' EXIT
export GIT_INDEX_FILE="$index"

for attempt in 1 2 3; do
  git fetch -q origin "$branch" 2>/dev/null || true
  parent=$(git rev-parse -q --verify "refs/remotes/origin/$branch" 2>/dev/null || true)
  if [ -n "$parent" ]; then git read-tree "$parent"; else git read-tree --empty; fi

  for file in "$@"; do
    blob=$(git hash-object -w "$file")
    git update-index --add --cacheinfo "100644,$blob,$issue/$(basename "$file")"
  done
  tree=$(git write-tree)
  if [ -n "$parent" ]; then
    commit=$(git commit-tree "$tree" -p "$parent" -m "Screenshots for #$issue")
  else
    commit=$(git commit-tree "$tree" -m "Screenshots for #$issue")
  fi

  if [ "${DRY_RUN:-}" = 1 ] || git push -q origin "$commit:refs/heads/$branch"; then
    for file in "$@"; do
      name=$(basename "$file")
      echo "![${name%.*}](https://github.com/$repo/blob/$commit/$issue/$name?raw=true)"
    done
    exit 0
  fi
  echo "Push rejected (attempt $attempt), retrying on the latest $branch" >&2
done
echo "Couldn't push to $branch." >&2
exit 1
