#!/bin/sh
# Usage: setup-landing-eval.sh <workspace> <compatible|failure>
# Creates a repository with no remote at <workspace>/repo.
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <workspace> <compatible|failure>" >&2
  exit 2
fi
here=$(cd "$(dirname "$0")" && pwd)
workspace=$1
scenario=$2
case "$scenario" in
  compatible | failure) ;;
  *) echo "unknown scenario $scenario" >&2; exit 2 ;;
esac
repo=$workspace/repo
if [ -e "$repo" ]; then
  echo "refusing to overwrite $repo" >&2
  exit 1
fi
mkdir -p "$repo/action-items/agent-tasks"
cp "$here"/landing-repo/* "$repo/"
cp "$here"/tasks/landing-common/*.md "$repo/action-items/agent-tasks/"
cp "$here"/tasks/landing-"$scenario"/*.md "$repo/action-items/agent-tasks/"
cd "$repo"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git -c init.defaultBranch=main init -q
git config user.name fixture
git config user.email fixture@example.invalid
git config commit.gpgsign false
git add -A
git commit -q -m "Add landing fixture"
