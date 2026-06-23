from __future__ import annotations

import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPT_DIR = SKILL_DIR / "scripts"
EXAMPLE = SKILL_DIR / "examples" / "basic-prd.yaml"
SOURCE_ASSETS = SKILL_DIR / "bundle" / "assets"
EVIDENCE_REFERENCE = (
    "plugins/project-advisor/skills/to-prd/scripts/bundle.py::generate_bundle"
)

if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))

import scripts as BUNDLE  # noqa: E402


def run_generator(
    manifest: Path,
    output_root: Path,
    *extra_args: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts",
            str(manifest),
            "--output-root",
            str(output_root),
            *extra_args,
        ],
        check=False,
        capture_output=True,
        text=True,
        cwd=SKILL_DIR,
    )


def load_example_manifest() -> dict[str, object]:
    return BUNDLE.load_yaml(EXAMPLE.read_text(encoding="utf-8"))


def sample_block(name: str) -> object:
    spec = BUNDLE.BLOCK_SPECS[name]
    if spec.kind == "summary":
        return {
            "metrics": [
                {
                    "label": "Current",
                    "value": "One fixed output",
                    "description": "A representative summary metric.",
                }
            ],
            "recommendation": "Use the generated review bundle.",
        }
    if spec.kind == "problem":
        return {"statement": "A clear problem.", "evidence": ["Observed evidence."]}
    if spec.kind == "scope":
        return {"in": ["Included behavior."], "out": ["Excluded behavior."]}
    if spec.kind == "diagram":
        return {"description": f"{spec.title} description.", "source": "A --> B"}
    if spec.kind == "frames":
        return [
            {
                spec.fields[0]: f"{spec.fields[0].replace('_', ' ')} value",
                spec.fields[1]: f"{spec.fields[1].replace('_', ' ')} value",
                "regions": [
                    {"label": "Primary region", "detail": "Visible review content."}
                ],
            }
        ]
    if spec.kind == "prototype":
        return {
            "description": "Review state changes without saving data.",
            "states": [
                {
                    "label": "Default",
                    "behavior": "The initial read-only state.",
                    "content": [{"label": "Status", "value": "Ready"}],
                },
                {
                    "label": "Blocked",
                    "behavior": "The blocked state explains the next action.",
                    "content": [{"label": "Status", "value": "Needs review"}],
                },
            ],
        }
    if spec.kind == "table":
        return {"columns": ["From", "To"], "rows": [["A", "B"]]}
    if spec.kind == "questions":
        return [{"question": "What still needs a decision?"}]
    if spec.kind == "list":
        return ["Intentionally excluded outcome."]
    if spec.kind == "code":
        return [
            {
                "reference": "src/example.py",
                "language": "python",
                "code": "result = build()",
                "annotation": "Existing contract evidence.",
            }
        ]
    item = {field: f"{field.replace('_', ' ')} value" for field in spec.fields}
    if name == "requirements":
        item["exception"] = "Validation target is selected in a later block when present."
    return [item]


def base_manifest(
    initiative_type: str = "small-feature",
    surfaces: list[str] | None = None,
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "slug": "catalog-fixture",
        "title": "Catalog fixture",
        "summary": "A focused manifest for block selection tests.",
        "status": "Draft",
        "initiative_type": initiative_type,
        "review_surfaces": surfaces or ["document"],
        "metadata": {"Owner": "Test"},
        "blocks": {},
    }


class AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.fragment_links: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        href = attributes.get("href")
        if tag == "a" and href and href.startswith("#") and len(href) > 1:
            self.fragment_links.append(href[1:])


def dump_yaml(value: object) -> str:
    return BUNDLE.dump_yaml(value)


def load_yaml(value: str) -> object:
    return BUNDLE.load_yaml(value)
