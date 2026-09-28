#!/bin/sh
# Prepares a workspace for eval 2: the PRD at inputs/prd.yaml and the fixture
# repository at outputs/repo, committed so the run's changes show in `git status`.
# Usage: setup-reading-log-eval.sh <workspace>
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <workspace>" >&2
  exit 2
fi

here=$(cd "$(dirname "$0")" && pwd)
workspace=$1

for target in "$workspace/inputs/prd.yaml" "$workspace/outputs/repo"; do
  if [ -e "$target" ]; then
    echo "refusing to overwrite $target" >&2
    exit 1
  fi
done

mkdir -p "$workspace/inputs" "$workspace/outputs"
cp "$here/prd-reading-log-tags.yaml" "$workspace/inputs/prd.yaml"
cp -R "$here/reading-log-repo" "$workspace/outputs/repo"

cd "$workspace/outputs/repo"
# Ignore global and system settings such as commit signing and hook paths,
# which can fail the fixture commit on a developer machine.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git -c init.defaultBranch=main init -q
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -q -m "Add reading-log fixture"
