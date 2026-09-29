#!/bin/sh
# Prepares `<workspace>/repo` with the slug repository and a task set in `action-items/agent-tasks/`.
# Commits the fixture on branch `main`, then applies the scenario's uncommitted changes.
# Usage:
# ```sh
# setup-orchestrate-eval.sh <workspace> <scenario>
# ```
# `<scenario>` is the name in the eval prompt.
# Start the run in `<workspace>/repo`.
#
# Scenarios:
# - `basic`: task 01 and 02 are independent, and task 03 depends on both.
# - `no-frontmatter`: `basic` with task 02's frontmatter removed.
# - `missing-predecessor`: `basic` with task 02 depending on task 01, outside the range 02 to 03.
# - `changed-source`: `basic` with an uncommitted change to `slug.py`, which task 01 changes.
# - `changed-action-items`: `basic` with an untracked file under `action-items/`.
# - `unsafe-name`: `basic` with task 02 named `02-word..count.md`, whose stem git rejects in branch names.
# - `stop`: `basic` where task 01 needs a decision about the separator, so it returns `stop`.
# - `conflict`: task 01 and 02 change the same line of `slug.py`, so the second commit conflicts on landing.
set -eu

if [ $# -ne 2 ]; then
  echo "usage: $0 <workspace> <scenario>" >&2
  exit 2
fi

here=$(cd "$(dirname "$0")" && pwd)
workspace=$1
scenario=$2
repo=$workspace/repo
tasks=$repo/action-items/agent-tasks

case $scenario in
  basic | no-frontmatter | missing-predecessor | unsafe-name | changed-source | changed-action-items | stop | conflict) ;;
  *)
    echo "unknown scenario $scenario" >&2
    exit 2
    ;;
esac

if [ -e "$repo" ]; then
  echo "refusing to overwrite $repo" >&2
  exit 1
fi

mkdir -p "$workspace"
cp -R "$here/orchestrate-repo" "$repo"
mkdir -p "$tasks"
cp "$here"/tasks/basic/*.md "$tasks/"

# An overlay file replaces the basic task with the same numeric prefix.
overlay() {
  for file in "$here/tasks/$1"/*.md; do
    name=$(basename "$file")
    rm -f "$tasks/${name%%-*}"-*.md
    cp "$file" "$tasks/$name"
  done
}

case $scenario in
  stop) overlay stop ;;
  conflict) overlay conflict ;;
  no-frontmatter)
    awk 'NR == 1 && $0 == "---" { skip = 1; next } skip && $0 == "---" { skip = 0; next } !skip' \
      "$tasks/02-word-count.md" >"$tasks/02-word-count.md.new"
    mv "$tasks/02-word-count.md.new" "$tasks/02-word-count.md"
    ;;
  unsafe-name)
    mv "$tasks/02-word-count.md" "$tasks/02-word..count.md"
    sed 's/02-word-count\.md/02-word..count.md/' "$tasks/03-summarize.md" >"$tasks/03-summarize.md.new"
    mv "$tasks/03-summarize.md.new" "$tasks/03-summarize.md"
    ;;
  missing-predecessor)
    sed 's/^depends_on: \[\]$/depends_on: [01-slugify.md]/' "$tasks/02-word-count.md" >"$tasks/02-word-count.md.new"
    mv "$tasks/02-word-count.md.new" "$tasks/02-word-count.md"
    ;;
esac

cd "$repo"
# Global and system settings, such as commit signing and hook paths, can prevent fixture commits on developer machines.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git -c init.defaultBranch=main init -q
# Repository settings allow commits with a fixture identity and without signing.
git config user.name fixture
git config user.email fixture@example.invalid
git config commit.gpgsign false
git add -A
git commit -q -m "Add slug fixture"

case $scenario in
  changed-source) printf '\n# unreviewed change\n' >>slug.py ;;
  changed-action-items) printf 'Notes for the run.\n' >action-items/notes.md ;;
esac
