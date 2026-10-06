"""Check saved TEST-09 reporting checkpoints without generating a report.

Usage: python3 test_report.py <checkpoint directory> [--diagrams] [--tasks <directory>]
Each checkpoint contains run.json and the agent's report.html.
The task comparison supports TEST-09 fixture items written as top level bullets.
"""

import json
import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.tags = []
        self.images = []
        self.sections = {}
        self.current_section = None
        self.details = {}
        self.current_detail = None
        self.rows = []
        self.current_row = None
        self.table_count = 0
        self.in_table = False
        self.headings = []
        self.current_heading = None
        self.styles = []
        self.in_style = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == "style":
            self.in_style = True
        if tag == "section":
            self.current_detail = None
            self.current_section = attrs.get("id")
            self.sections[self.current_section] = []
        if tag == "img":
            self.images.append((self.current_section, attrs))
        if tag == "table":
            self.table_count += 1
            self.in_table = True
        if tag == "tr" and self.in_table and self.table_count == 1:
            self.current_row = []
        if tag in ("h1", "h2", "h3", "h4"):
            self.current_heading = []

    def handle_endtag(self, tag):
        if tag == "style":
            self.in_style = False
        if tag == "table":
            self.in_table = False
        if tag in ("h1", "h2", "h3", "h4") and self.current_heading is not None:
            heading = " ".join(self.current_heading).strip().lower().rstrip(":")
            self.headings.append(heading)
            self.current_detail = heading
            self.details.setdefault((self.current_section, heading), [])
            self.current_heading = None
        if tag == "section":
            self.current_section = None
            self.current_detail = None
        if tag == "tr" and self.current_row is not None:
            self.rows.append(" ".join(" ".join(self.current_row).split()))
            self.current_row = None

    def handle_data(self, data):
        self.text.append(data)
        if self.in_style:
            self.styles.append(data)
        if self.current_row is not None:
            self.current_row.append(data)
        if self.current_heading is not None:
            self.current_heading.append(data)
        if self.current_section is not None and self.current_detail is not None:
            self.details[(self.current_section, self.current_detail)].append(data)
        if self.current_section is not None:
            self.sections[self.current_section].append(data)


ROOT = None
DIAGRAMS = False
TASKS = None
if __name__ == "__main__":
    ROOT = Path(sys.argv.pop(1)) if len(sys.argv) > 1 else Path(".")
    DIAGRAMS = "--diagrams" in sys.argv
    if DIAGRAMS:
        sys.argv.remove("--diagrams")
    if "--tasks" in sys.argv:
        index = sys.argv.index("--tasks")
        TASKS = Path(sys.argv[index + 1])
        del sys.argv[index : index + 2]


def item_text(value):
    return " ".join(value.replace("`", "").split()).rstrip(".")


@unittest.skipIf(ROOT is None, "run test_report.py with a checkpoint directory")
class ReportTests(unittest.TestCase):
    def setUp(self):
        self.run = json.loads((ROOT / "run.json").read_text())
        report = ROOT / "report.html"
        self.assertTrue(report.is_file(), "report.html must survive each checkpoint")
        self.page = Page()
        self.page.feed(report.read_text())
        self.text = " ".join(" ".join(self.page.text).split())

    def assertText(self, value, text=None):
        self.assertIn(" ".join(str(value).split()), self.text if text is None else text)

    def assertRecord(self, record, text):
        if isinstance(record, dict):
            for value in record.values():
                self.assertRecord(value, text)
        elif isinstance(record, list):
            for value in record:
                self.assertRecord(value, text)
        elif record is not None:
            self.assertText(record, text)

    def assertGapRecord(self, task, record, heading):
        """The category conveys disposition; retain any attached rationale."""
        if isinstance(record, list):
            for gap in record:
                self.assertGapRecord(task, gap, heading)
            return
        details = dict(record)
        disposition = details.get("disposition")
        if isinstance(disposition, str):
            match = re.fullmatch(
                r"(accepted|rejected|fixed|settled)(?:\b[\s:;,-]*(.*))?",
                disposition, flags=re.IGNORECASE,
            )
            if match and heading == {
                "accepted": "accepted gaps", "rejected": "rejected gaps",
                "fixed": "resolved gaps", "settled": "resolved gaps",
            }[match[1].lower()]:
                details["disposition"] = match[2] or None
        self.assertRecord(details, self.detailText(task, heading))

    def detailText(self, task, heading):
        return " ".join(" ".join(self.page.details.get(
            ("task-" + task["file"][:2], heading), []
        )).split())

    def assertLocalURL(self, value):
        self.assertTrue(value, "empty resource URL")
        parsed = urlsplit(value)
        self.assertFalse(parsed.scheme or parsed.netloc or parsed.query, value)
        if not parsed.path and parsed.fragment:
            self.assertIn(unquote(parsed.fragment),
                          [attrs.get("id") for _, attrs in self.page.tags])
            return
        path = unquote(parsed.path)
        self.assertNotIn("\\", path)
        self.assertFalse(Path(path).is_absolute(), value)
        self.assertNotIn("..", Path(path).parts, value)
        target = (ROOT / path).resolve()
        self.assertTrue(target.is_relative_to(ROOT.resolve()), value)
        self.assertTrue(target.is_file(), value)

    def test_run_header_and_every_selected_task(self):
        for key in (
            "task_directory",
            "start_branch",
            "start_commit",
            "integration_branch",
            "started_at",
            "updated_at",
            "concurrency_limit",
            "pass_limit",
        ):
            if self.run[key] is not None:
                self.assertText(self.run[key])
        if self.run["integration_branch"]:
            self.assertRegex(
                self.text,
                r"git merge ['\"]?"
                + re.escape(self.run["integration_branch"])
                + r"['\"]?",
            )
        else:
            self.assertNotIn("git merge", self.text)
        if self.run["range"]:
            for value in self.run["range"].values():
                self.assertText(value)
        else:
            self.assertText("All tasks")
        if self.run["start_branch"] is None:
            self.assertText("Detached HEAD")
        for task in self.run["tasks"]:
            self.assertText(task["file"])
            self.assertText(task["status"])
            rows = [row for row in self.page.rows if task["file"] in row]
            self.assertEqual(len(rows), 1, "one status table row per selected task")
            self.assertText(task["status"], rows[0])

    def test_task_sections_preserve_evidence_and_dispositions(self):
        for task in self.run["tasks"]:
            if task["status"] in ("skipped", "queued", "not_started"):
                self.assertNotIn("task-" + task["file"][:2], self.page.sections)
                continue
            section = " ".join(
                " ".join(self.page.sections["task-" + task["file"][:2]]).split()
            )
            for label in (
                "Status",
                "Commit",
                "Coverage",
                "Decisions",
                "Accepted gaps",
                "Rejected gaps",
                "Unresolved gaps",
                "Blocked behavior",
                "Model",
                "Effort",
                "Model choice",
            ):
                self.assertText(label, section)
            for value in (
                task["status"],
                task["commit"],
                task["commit_subject"],
                task["model_reason"],
            ):
                if value is not None:
                    self.assertText(value, section)
            for field in ("model", "effort"):
                if task[field] is None:
                    self.assertText("Not reported", section)
                    continue
                for value in task[field].values():
                    self.assertText(
                        value if value is not None else "Not reported", section
                    )
            for item in task["coverage"]:
                for value in item.values():
                    self.assertText(value, section)
            for value in task["decision_ledger"] + task["blocked_behavior"]:
                self.assertText(value, section)
            for field in ("waiting", "ended", "answers", "conflict_resolution"):
                self.assertRecord(task.get(field), section)
            self.assertGapRecord(task, task.get("accepted_gaps", []), "accepted gaps")
            for attempt in (task.get("conflict_resolution") or {}).get("attempts", []):
                self.assertRecord(attempt.get("accepted_items", []),
                                  self.detailText(task, "accepted gaps"))
            for record in (task.get("waiting"), task.get("ended")):
                if record:
                    self.assertRecord(record.get("gaps", []),
                                      self.detailText(task, "unresolved gaps"))
                    self.assertRecord((record.get("question") or {}).get("gaps", [])
                                      if isinstance(record.get("question"), dict) else [],
                                      self.detailText(task, "unresolved gaps"))
            for gap in task["gaps"]:
                disposition = gap.get("disposition", "").lower()
                heading = next((label for status, label in (
                    ("accepted", "accepted gaps"), ("rejected", "rejected gaps"),
                    ("fixed", "resolved gaps"), ("settled", "resolved gaps")
                ) if disposition.startswith(status)), "unresolved gaps")
                self.assertGapRecord(task, gap, heading)

    @unittest.skipIf(
        TASKS is None, "pass --tasks to compare original fixture contracts"
    )
    def test_coverage_accounts_for_each_fixture_contract_item(self):
        for task in self.run["tasks"]:
            if task["status"] in ("skipped", "queued", "not_started"):
                continue
            source = (TASKS / task["file"]).read_text()
            recorded = [item_text(entry["item"]) for entry in task["coverage"]]
            for block in re.split(r"^## ", source, flags=re.MULTILINE)[1:]:
                heading, _, body = block.partition("\n")
                if heading not in ("Required behavior", "Acceptance"):
                    continue
                for expected in re.findall(r"^- (.+)$", body, flags=re.MULTILINE):
                    expected = item_text(expected)
                    self.assertTrue(
                        any(value.endswith(expected) for value in recorded),
                        f"{task['file']} omits {heading}: {expected}",
                    )

    def test_copied_text_cannot_create_active_content_or_network_requests(self):
        self.assertText('<script>alert("title")</script>')
        allowed = {
            "html": {"lang"}, "head": set(), "meta": {"charset", "name", "content"},
            "title": set(), "style": set(), "body": set(), "main": set(),
            "header": set(), "footer": set(), "section": set(), "div": set(),
            "span": set(), "p": set(), "h1": set(), "h2": set(), "h3": set(),
            "h4": set(), "ul": set(), "ol": {"start"}, "li": set(),
            "dl": set(), "dt": set(), "dd": set(), "pre": set(), "code": set(),
            "strong": set(), "em": set(), "b": set(), "i": set(), "br": set(),
            "hr": set(), "table": set(), "caption": set(), "thead": set(),
            "tbody": set(), "tfoot": set(), "tr": set(),
            "th": {"scope", "colspan", "rowspan"}, "td": {"colspan", "rowspan"},
            "a": {"href"}, "img": {"src", "alt", "width", "height"},
            "figure": set(), "figcaption": set(),
        }
        id_references = {"aria-labelledby", "aria-describedby", "aria-details",
                         "aria-errormessage", "aria-controls", "aria-owns",
                         "aria-flowto", "aria-activedescendant"}
        accessibility = id_references | {"role", "aria-label", "aria-hidden",
                                         "aria-expanded", "aria-current"}
        ids = [attrs["id"] for _, attrs in self.page.tags if "id" in attrs]
        for tag, attrs in self.page.tags:
            self.assertIn(tag, allowed)
            for key, value in attrs.items():
                self.assertIn(key, allowed[tag] | {"id", "class", "title", "style"}
                              | accessibility)
                if key in id_references:
                    self.assertTrue(value and value.split(), (tag, key))
                    for reference in value.split():
                        self.assertEqual(ids.count(reference), 1, (key, reference))
                if key in ("src", "href"):
                    self.assertLocalURL(value)
        self.assertNotIn("<script>", (ROOT / "report.html").read_text())
        css = " ".join(
            self.page.styles + [attrs.get("style", "") for _, attrs in self.page.tags]
        ).lower()
        self.assertNotIn("@import", css)
        self.assertNotIn("url(", css)

    def test_diagrams_only_for_committed_tasks_when_skill_available(self):
        committed = [task for task in self.run["tasks"] if task["commit"]]
        ready = [task for task in committed
                 if (task.get("diagram") or {}).get("status") == "ready"]
        self.assertEqual(len(self.page.images), len(ready) if DIAGRAMS else 0)
        if not DIAGRAMS:
            for heading in ("diagram", "diagrams", "change diagram", "change diagrams"):
                self.assertNotIn(heading, self.page.headings)
            self.assertNotIn("svg", [tag for tag, _ in self.page.tags])
            return
        for task in committed:
            images = [
                attrs
                for section, attrs in self.page.images
                if section == "task-" + task["file"][:2]
            ]
            diagram = task["diagram"]
            self.assertIn(diagram["status"], ("pending", "failed", "ready"))
            if diagram["status"] != "ready":
                self.assertEqual(len(images), 0)
                unresolved = self.detailText(task, "unresolved gaps")
                self.assertText("diagram", unresolved.lower())
                self.assertText(diagram["status"], unresolved.lower())
                self.assertIsNone(diagram["path"])
                self.assertIsNone(diagram["alt"])
                if diagram["status"] == "failed":
                    self.assertTrue(diagram.get("failure"))
                    self.assertText(diagram["failure"], unresolved)
                continue
            self.assertEqual(len(images), 1)
            self.assertTrue(diagram["alt"])
            self.assertEqual(images[0].get("alt"), diagram["alt"])
            self.assertEqual(images[0].get("src"), diagram["path"])
            self.assertLocalURL(images[0]["src"])
            path = (ROOT / images[0]["src"]).resolve()
            self.assertTrue(path.is_relative_to(ROOT.resolve()))
            self.assertTrue(path.is_file())
            if path.suffix == ".svg":
                svg = ElementTree.parse(path).getroot()
                for element in svg.iter():
                    tag = element.tag.rsplit("}", 1)[-1].lower()
                    self.assertNotIn(tag, ("script", "foreignobject", "image"))
                    for key, value in element.attrib.items():
                        key = key.rsplit("}", 1)[-1].lower()
                        self.assertFalse(key.startswith("on"), key)
                        if key == "href":
                            self.assertTrue(value.startswith("#"), value)
                    content = (
                        (element.text or "") + " ".join(element.attrib.values())
                    ).lower()
                    self.assertNotIn("@import", content)
                    for url in re.findall(r"url\((.*?)\)", content):
                        self.assertTrue(url.strip(" '\"").startswith("#"), url)


if __name__ == "__main__":
    unittest.main()
