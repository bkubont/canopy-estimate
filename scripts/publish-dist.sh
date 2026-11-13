#!/usr/bin/env bash
# Publish a built folder to a deploy branch that Hostinger's Git deploy pulls.
# The branch holds only the built site (index.html at its root), one commit per
# deploy, so you can see what went live and roll back by redeploying an older one.
#
# Usage: scripts/publish-dist.sh <built-folder> <remote> <branch> "<message>"
set -euo pipefail
SRC="$(cd "$1" && pwd)"
REMOTE="$2"
BRANCH="$3"
MSG="$4"

[ -f "$SRC/index.html" ] || { echo "No index.html in $SRC; refusing to publish an empty site." >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
git init -q
git config user.name "${GIT_AUTHOR_NAME:-deploy-bot}"
git config user.email "${GIT_AUTHOR_EMAIL:-deploy-bot@users.noreply.github.com}"
git remote add origin "$REMOTE"

# Continue the branch's history if it exists, otherwise start it.
if git fetch -q --depth 1 origin "$BRANCH" 2>/dev/null; then
  git checkout -q -b "$BRANCH" FETCH_HEAD
  git rm -rq --ignore-unmatch . >/dev/null
else
  git checkout -q --orphan "$BRANCH"
fi

cp -R "$SRC"/. .
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed since the last deploy."
  exit 0
fi
git commit -q -m "$MSG"
git push -q origin "$BRANCH"
echo "Published $(git rev-parse --short HEAD) to $BRANCH."
