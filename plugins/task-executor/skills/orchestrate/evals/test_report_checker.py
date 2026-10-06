"""Synthetic regression checks for the saved-report validator (no orchestration)."""
import html
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import test_report as checker


class CheckerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.task = dict(file='01-task.md', status='done', commit='abc',
                         commit_subject='subject', model_reason='reason',
                         model=None, effort=None, coverage=[], decision_ledger=[],
                         blocked_behavior=[], gaps=[], accepted_gaps=[])
        self.check = checker.ReportTests()
        self.check.run = {'tasks': [self.task]}
        self.patch = patch.multiple(checker, ROOT=self.root, DIAGRAMS=True)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def page(self, content):
        self.check.page = checker.Page()
        self.check.page.feed(content)
        self.check.text = ' '.join(' '.join(self.check.page.text).split())
        (self.root / 'report.html').write_text(content)

    def diagram(self, status, content):
        self.task['diagram'] = dict(status=status, path=None, alt=None)
        if status == 'failed':
            self.task['diagram']['failure'] = 'export interrupted'
        self.page('<section id="task-01"><h3>Unresolved gaps</h3>' + content + '</section>')
        self.check.test_diagrams_only_for_committed_tasks_when_skill_available()

    def test_pending_and_failed_checkpoints(self):
        self.diagram('pending', 'Diagram pending')
        self.diagram('failed', 'Diagram failed: export interrupted')
        for status in ('pending', 'failed'):
            with self.subTest(status=status), self.assertRaises(AssertionError):
                self.diagram(status, '')
        with self.assertRaises(AssertionError):
            self.diagram('failed', 'Diagram failed')

    def test_ready_requires_one_matching_local_image(self):
        (self.root / 'diagram.png').write_bytes(b'fixture')
        self.task['diagram'] = dict(status='ready', path='diagram.png', alt='relations')
        content = '<section id="task-01"><img src="diagram.png" alt="relations"></section>'
        self.page(content)
        self.check.test_diagrams_only_for_committed_tasks_when_skill_available()
        for invalid in ('', content + content, content.replace('relations', 'wrong')):
            self.page(invalid)
            with self.assertRaises(AssertionError):
                self.check.test_diagrams_only_for_committed_tasks_when_skill_available()

    def test_safe_diagram_figure_and_caption(self):
        # Saved diagram reports wrap the local image in a semantic figure.
        (self.root / 'task-01-change.svg').write_text(
            '<svg xmlns="http://www.w3.org/2000/svg"><text>Relations</text></svg>')
        self.task['diagram'] = dict(status='ready', path='task-01-change.svg',
                                    alt='Changed components and relations')
        content = (html.escape('<script>alert("title")</script>')
                   + '<section id="task-01" aria-labelledby="task-heading">'
                   '<h2 id="task-heading">Task 01</h2><h3>Change diagram</h3>'
                   '<figure><img src="task-01-change.svg" '
                   'alt="Changed components and relations">'
                   '<figcaption>Changed components and relations</figcaption>'
                   '</figure></section>')
        self.page(content)
        self.check.test_copied_text_cannot_create_active_content_or_network_requests()
        self.check.test_diagrams_only_for_committed_tasks_when_skill_available()
        for unsafe in (content.replace('<figure>', '<figure onclick="alert(1)">'),
                       content.replace('<figcaption>', '<figcaption src="https://example.invalid/a">')):
            self.page(unsafe)
            with self.subTest(markup=unsafe), self.assertRaises(AssertionError):
                self.check.test_copied_text_cannot_create_active_content_or_network_requests()

    def evidence_page(self, accepted='', unresolved='', other=''):
        labels = ('Status', 'Commit', 'Coverage', 'Decisions', 'Rejected gaps',
                  'Blocked behavior', 'Model', 'Effort', 'Model choice')
        self.page('<section id="task-01">' + ''.join('<h3>' + label + '</h3>' for label in labels)
                  + 'done abc subject reason Not reported ' + other
                  + '<h3>Accepted gaps</h3>' + accepted
                  + '<h3>Unresolved gaps</h3>' + unresolved + '</section>')

    def test_accepted_gap_details_and_location(self):
        self.task['accepted_gaps'] = [dict(item='unique item', location='unique location',
                                         evidence='unique evidence', answer='user accepts')]
        values = list(self.task['accepted_gaps'][0].values())
        self.evidence_page(accepted=' '.join(values))
        self.check.test_task_sections_preserve_evidence_and_dispositions()
        for omitted in values:
            self.evidence_page(accepted=' '.join(v for v in values if v != omitted), other=omitted)
            with self.assertRaises(AssertionError):
                self.check.test_task_sections_preserve_evidence_and_dispositions()

    def test_category_heading_conveys_disposition(self):
        # Saved reports use a heading followed by a gap/rationale table.
        for status, heading in (("rejected", "Rejected gaps"),
                                ("accepted", "Accepted gaps"),
                                ("fixed", "Resolved gaps"),
                                ("settled", "Resolved gaps")):
            with self.subTest(status=status):
                self.task['gaps'] = [dict(gap='Remote stylesheet request',
                                         disposition=status,
                                         rationale='Offline contract excludes network')]
                self.evidence_page()
                content = (self.root / 'report.html').read_text()
                table = ('<h3>' + heading + '</h3><table><tr><th>Gap</th>'
                         '<th>Boundary rationale</th></tr><tr>'
                         '<td>Remote stylesheet request</td>'
                         '<td>Offline contract excludes network</td></tr></table>')
                self.page(content.replace('</section>', table + '</section>'))
                self.check.test_task_sections_preserve_evidence_and_dispositions()
                for detail in ('Remote stylesheet request', 'Offline contract excludes network'):
                    self.page(content.replace('</section>', table.replace(detail, '') + '</section>'))
                    with self.assertRaises(AssertionError):
                        self.check.test_task_sections_preserve_evidence_and_dispositions()
        self.task['gaps'] = [dict(gap='Remote stylesheet request',
                                 disposition='rejected: Offline contract excludes network')]
        self.page(content.replace('</section>', table.replace('Resolved gaps', 'Rejected gaps') + '</section>'))
        self.check.test_task_sections_preserve_evidence_and_dispositions()

    def test_accessible_sections_and_id_references(self):
        sentinel = html.escape('<script>alert("title")</script>')
        markup = ('<section aria-labelledby="task-title extra-title" '
                  'aria-describedby="description" role="region">'
                  '<h2 id="task-title">Task</h2><span id="extra-title">Changes</span>'
                  '<p id="description" aria-label="Description">Evidence</p>'
                  '<span aria-hidden="true">Decoration</span></section>')
        self.page(sentinel + markup)
        self.check.test_copied_text_cannot_create_active_content_or_network_requests()
        for invalid in (markup.replace('task-title extra-title', 'missing'),
                        markup.replace('task-title extra-title', ''),
                        markup.replace('</section>', '<p id="task-title">Duplicate</p></section>'),
                        markup.replace('role="region"', 'onfocus="alert(1)"'),
                        markup.replace('role="region"', 'src="https://example.invalid/a"')):
            self.page(sentinel + invalid)
            with self.subTest(markup=invalid), self.assertRaises(AssertionError):
                self.check.test_copied_text_cannot_create_active_content_or_network_requests()

    def test_nested_waiting_ended_and_resolution_details(self):
        for field, record in (
            ('waiting', {'gaps': [{'evidence': 'waiting evidence'}]}),
            ('ended', {'question': {'gaps': [{'evidence': 'ended evidence'}]}}),
            ('conflict_resolution', {'attempts': [{'accepted_items': [{'answer': 'landing answer'}]}]}),
        ):
            with self.subTest(field=field):
                self.task[field] = record
                self.evidence_page()
                with self.assertRaises(AssertionError):
                    self.check.test_task_sections_preserve_evidence_and_dispositions()
                value = {'waiting': 'waiting evidence', 'ended': 'ended evidence',
                         'conflict_resolution': 'landing answer'}[field]
                self.evidence_page(accepted=value, unresolved=value)
                self.check.test_task_sections_preserve_evidence_and_dispositions()
                del self.task[field]

    def test_offline_allowlist_and_paths(self):
        sentinel = html.escape('<script>alert("title")</script>')
        (self.root / 'local.png').write_bytes(b'fixture')
        for markup in ('<video poster="https://example.invalid/tracker.png"></video>',
                       '<img srcset="https://example.invalid/a.png">',
                       '<img src="https://example.invalid/a.png">',
                       '<a href="../outside">outside</a>',
                       '<img src="%2e%2e/outside">', '<p onclick="alert(1)">x</p>'):
            self.page(sentinel + markup)
            with self.subTest(markup=markup), self.assertRaises(AssertionError):
                self.check.test_copied_text_cannot_create_active_content_or_network_requests()
        self.page(sentinel + '<section id="task-01"><a href="#task-01">task</a>'
                  '<img src="local.png" alt="local"></section>')
        self.check.test_copied_text_cannot_create_active_content_or_network_requests()
        (self.root / 'escape.png').symlink_to(self.root.parent / 'outside.png')
        with self.assertRaises(AssertionError):
            self.check.assertLocalURL('escape.png')


if __name__ == '__main__':
    unittest.main()
