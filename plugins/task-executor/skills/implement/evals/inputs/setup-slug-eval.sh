#!/bin/sh
# Prepares `<workspace>/repo` with the slug repository and one task from `tasks/`.
# Commits the fixture so the run's changes appear in `git status`.
# With `--worktree`, adds `<workspace>/worktree` on branch `task` for delegated runs.
# The delegated task path points into `<workspace>/repo`.
# Usage:
# ```sh
# setup-slug-eval.sh <workspace> <task> [--worktree]
# ```
# `<task>` names the `tasks/` entry in the eval's `files`, without `.md`, such as `spaces-blocked`.
# When the eval prompt names `<workspace>/worktree`, pass `--worktree` and start the run there.
# Otherwise, start in `<workspace>/repo`.
set -eu

if [ $# -lt 2 ] || [ $# -gt 3 ] || { [ $# -eq 3 ] && [ "$3" != --worktree ]; }; then
  echo "usage: $0 <workspace> <task> [--worktree]" >&2
  exit 2
fi

here=$(cd "$(dirname "$0")" && pwd)
workspace=$1
task=$2
source="$here/tasks/$task.md"

if [ ! -f "$source" ]; then
  echo "unknown task $task; expected a file in $here/tasks" >&2
  exit 2
fi

for target in "$workspace/repo" "$workspace/worktree"; do
  if [ -e "$target" ]; then
    echo "refusing to overwrite $target" >&2
    exit 1
  fi
done

# All spaces variants use the task filename from the eval prompts.
case $task in
  separator) name=01-slugify-separator.md ;;
  *) name=01-slugify-spaces.md ;;
esac

mkdir -p "$workspace"
cp -R "$here/slug-repo" "$workspace/repo"
mkdir -p "$workspace/repo/action-items/agent-tasks"
cp "$source" "$workspace/repo/action-items/agent-tasks/$name"

cd "$workspace/repo"
# Global and system settings, such as commit signing and hook paths, can prevent fixture commits on developer machines.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git -c init.defaultBranch=main init -q
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -q -m "Add slug fixture"

if [ $# -eq 3 ]; then
  git worktree add -q "$workspace/worktree" -b task
fi
