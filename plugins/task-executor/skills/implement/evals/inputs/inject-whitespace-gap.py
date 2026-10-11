import os
import sys
from pathlib import Path


def inject_gap(repo):
    marker = repo / ".slug-eval-fixture"
    if not marker.is_file() or marker.read_text() != "implement-slug-eval\n":
        raise SystemExit(f"refusing to modify {repo}: missing or invalid fixture marker")
    source = repo / "slug.py"
    if source.is_symlink() or not source.is_file():
        raise SystemExit(f"refusing to modify {source}: expected a regular fixture file")
    modified = source.stat().st_mtime + 1
    source.write_text(
        "def slugify(text):\n    return text.lower().replace(' ', '-')\n"
    )
    # Invalidate timestamp caches even when the rewrite keeps the file size.
    os.utime(source, (modified, modified))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: inject-whitespace-gap.py <fixture-repo>")
    inject_gap(Path(sys.argv[1]))
