from __future__ import annotations

import copy
import json
import os
import shutil
import stat
import subprocess
import threading
import unittest
from typing import Any
from unittest import mock

from support import SKILL_DIR  # noqa: F401  # puts the skill directory on sys.path

from interview_support import (
    BROWSER_LOG_ENV,
    InterviewHarness,
    InterviewTestCase,
    ServerFixture,
    wait_for_exit,
)
from scripts.interview import client
from scripts.interview.server import ServerRunning, create_server
from scripts.interview.session import SessionFiles, read_state
from toon_reader import top_level_array, top_level_field

ROUND_ONE = {
    "id": "ROUND-01",
    "questions": [
        {
            "node": "NODE-03",
            "label": "Storage",
            "question": "Where does the session keep answers?",
            "multi_select": False,
            "options": [
                {
                    "label": "Session directory",
                    "description": "Files next to the scratch prd.yaml.",
                    "recommended": True,
                },
                {"label": "Registry", "description": "One file for the user."},
            ],
        },
        {
            "node": "NODE-04",
            "label": "Page parts",
            "question": "Which parts does the page show?",
            "multi_select": True,
            "options": [
                {"label": "History", "description": "Earlier rounds.", "recommended": True},
                {"label": "Status lamp", "description": "Round state.", "recommended": True},
                {"label": "Shortcuts", "description": "Faster answers."},
            ],
        },
    ],
}

FIVE_CHOICES_ROUND = {
    "id": "ROUND-02",
    "questions": [
        *ROUND_ONE["questions"],
        {
            "node": "NODE-05",
            "label": "Queue",
            "question": "Where do submits wait?",
            "multi_select": False,
            "options": [{"label": "Disk", "description": "A file.", "recommended": True}],
        },
        {
            "node": "NODE-06",
            "label": "Load",
            "question": "How many rounds does a session hold?",
            "multi_select": False,
            "options": [{"label": "Ten", "description": "A small cap.", "recommended": True}],
        },
        {
            "node": "NODE-07",
            "label": "Theme",
            "question": "Which colour theme does the page use?",
            "multi_select": False,
            "options": [{"label": "Dark", "description": "Dark only.", "recommended": True}],
        },
    ],
}

FIVE_CHOICES_SUBMIT = {
    "round": "ROUND-02",
    "comment": "Good round, thanks.",
    "answers": [
        {
            "node": "NODE-03",
            "choice": "option",
            "selected": ["Session directory"],
            "note": "Keep it local.",
        },
        {"node": "NODE-04", "choice": "option", "selected": ["History", "Status lamp"]},
        {"node": "NODE-05", "choice": "written", "written": "A queue in memory."},
        {"node": "NODE-06", "choice": "decide_later", "reason": "Needs load numbers."},
        {"node": "NODE-07", "choice": "out_of_scope", "reason": "The page task owns styling."},
    ],
}

# Written by hand from the task contract, so a change in the payload shows up here.
FIVE_CHOICES_ANSWERS = """\
instructions: "Write each answer record to the design_tree node with the same NODE id. \
For a deferred node, add the open_question text as a new open_questions entry with a new id, \
and list that id in the node relates_to."
comment: "Good round, thanks."
answers[5]:
  - node: NODE-03
    label: Storage
    choice: option
    selected[1]: Session directory
    written: ""
    reason: ""
    note: Keep it local.
    record:
      status: settled
      source: user
      answer: Session directory
      rationale: "Write it from the note and the option description: Files next to the scratch \
prd.yaml."
  - node: NODE-04
    label: Page parts
    choice: option
    selected[2]: History,Status lamp
    written: ""
    reason: ""
    note: ""
    record:
      status: settled
      source: user
      answer: History; Status lamp
      rationale: "Write it from the option descriptions: Earlier rounds. Round state."
  - node: NODE-05
    label: Queue
    choice: written
    selected[0]:
    written: A queue in memory.
    reason: ""
    note: ""
    record:
      status: settled
      source: user
      answer: A queue in memory.
      rationale: Write it from the written answer.
  - node: NODE-06
    label: Load
    choice: decide_later
    selected[0]:
    written: ""
    reason: Needs load numbers.
    note: ""
    record:
      status: deferred
      open_question: "How many rounds does a session hold? Blocker: Needs load numbers. \
Owner: the user."
      relates_to: the id of the new open_questions entry
  - node: NODE-07
    label: Theme
    choice: out_of_scope
    selected[0]:
    written: ""
    reason: The page task owns styling.
    note: ""
    record:
      status: pruned
      reason: The page task owns styling.
"""


ROUND_ONE_SUBMIT = {
    "round": "ROUND-01",
    "answers": [
        {"node": "NODE-03", "choice": "option", "selected": ["Registry"]},
        {"node": "NODE-04", "choice": "written", "written": "Only the questions."},
    ],
}


class InterviewRoundTestCase(InterviewTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.harness = InterviewHarness(self, self.root, self.session)


class InterviewServerTestCase(InterviewTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.server = ServerFixture(self, self.session, ROUND_ONE)


class InterviewAskProcessTests(InterviewRoundTestCase):
    """Checks on the output of `interview ask` as its own process."""

    def test_valid_submit_makes_ask_print_only_the_answered_payload(self) -> None:
        ask = self.harness.start_ask_process(self.write_round(FIVE_CHOICES_ROUND))
        start = ask.wait_started()

        status, body = self.harness.submit(FIVE_CHOICES_SUBMIT)
        result = ask.finish()

        self.assertEqual(status, 200, body)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stderr, start)
        lines = result.stdout.rstrip("\n").splitlines()
        self.assertEqual(lines[0], "status: answered")
        self.assertTrue(lines[-1].startswith("next["), result.stdout)
        self.assertEqual(top_level_field(result.stdout, "round"), "ROUND-02")

    def test_browser_launcher_output_stays_out_of_command_output(self) -> None:
        launcher = self.root / "noisy-browser"
        launched = self.root / "launched.log"
        launcher.write_text(
            f'#!/bin/sh\necho launcher-out\necho launcher-err >&2\necho "$1" >> "{launched}"\n',
            encoding="utf-8",
        )
        launcher.chmod(0o755)
        del self.harness.process_env[BROWSER_LOG_ENV]
        self.harness.process_env["BROWSER"] = str(launcher)
        ask = self.harness.start_ask_process(self.write_round(ROUND_ONE))
        ask.wait_started()

        self.harness.submit(ROUND_ONE_SUBMIT)
        result = ask.finish()

        self.assertEqual(launched.read_text(encoding="utf-8").count("#token="), 1)
        self.assertEqual(len(result.stderr.splitlines()), 1, result.stderr)
        self.assertNotIn("launcher", result.stdout + result.stderr)
        self.assertTrue(result.stdout.startswith("status: answered"), result.stdout)

    def test_rerun_of_stopped_ask_waits_again_without_duplicate_round(self) -> None:
        stopped = self.harness.start_ask_process(self.write_round(ROUND_ONE))
        stopped.wait_started()
        stopped.stop()

        rerun = self.harness.start_ask(self.write_round(ROUND_ONE))
        rerun.wait_started()
        self.harness.submit(ROUND_ONE_SUBMIT)
        result = rerun.finish()

        self.assertEqual(top_level_field(result.stdout, "status"), "answered")
        self.assertEqual(
            sorted(p.name for p in self.harness.rounds_dir.iterdir()), ["ROUND-01.json"]
        )
        self.assertEqual(len(self.harness.browser_calls()), 1)


class InterviewAskStartTests(InterviewRoundTestCase):
    def test_first_ask_blocks_and_writes_one_start_line_without_token(self) -> None:
        ask = self.harness.start_ask(self.write_round(ROUND_ONE))

        start = ask.wait_started()

        self.assertTrue(ask.is_waiting())
        self.assertEqual(len(start.splitlines()), 1, start)
        self.assertIn("ROUND-01", start)
        self.assertNotIn(self.harness.token(), start)

    def test_first_round_opens_page_once_with_token_in_fragment(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()

        self.assertEqual(
            self.harness.browser_calls(),
            [f"http://127.0.0.1:{self.harness.port()}/#token={self.harness.token()}"],
        )

    def test_command_output_holds_no_token(self) -> None:
        ask = self.harness.start_ask(self.write_round(ROUND_ONE))
        ask.wait_started()
        token = self.harness.token()
        self.harness.submit(ROUND_ONE_SUBMIT)
        answered = ask.finish()
        replay = self.harness.ask(self.write_round(ROUND_ONE))
        ended = self.harness.end()

        for result in (answered, replay, ended):
            self.assertNotIn(token, result.stdout + result.stderr)


class InterviewServerRouteTests(InterviewServerTestCase):
    def test_session_state_file_has_mode_0600(self) -> None:
        mode = stat.S_IMODE(self.server.files.state.stat().st_mode)

        self.assertEqual(oct(mode), oct(0o600))

    def test_server_socket_address_is_loopback(self) -> None:
        state = json.loads(self.server.files.state.read_text())

        self.assertEqual(self.server.server.socket.getsockname()[0], "127.0.0.1")
        self.assertEqual(state["host"], "127.0.0.1")

    @unittest.skipIf(shutil.which("lsof") is None, "lsof is not installed")
    def test_server_listens_only_on_loopback(self) -> None:
        listing = subprocess.run(
            ["lsof", "-nP", "-a", "-p", str(os.getpid()), "-iTCP", "-sTCP:LISTEN"],
            check=False,
            capture_output=True,
            text=True,
        ).stdout

        self.assertIn(f"127.0.0.1:{self.server.port} (LISTEN)", listing)
        self.assertNotIn(f"*:{self.server.port}", listing)

    def test_second_server_for_session_with_running_server_is_refused(self) -> None:
        state = self.server.files.state.read_bytes()

        with self.assertRaises(ServerRunning):
            create_server(self.server.files).server_close()

        self.assertEqual(self.server.files.state.read_bytes(), state)

    def test_page_data_route_gives_open_round_only_with_token(self) -> None:
        status, body = self.server.request("GET", "/api/round", token=self.server.token)
        forbidden, _ = self.server.request("GET", "/api/round")

        self.assertEqual(status, 200)
        self.assertEqual((body["state"], body["round"]["id"]), ("open", "ROUND-01"))
        self.assertEqual(forbidden, 403)

    def test_result_route_for_round_that_is_not_stored_is_not_found(self) -> None:
        status, body = self.server.request(
            "GET", "/api/rounds/ROUND-09/result", token=self.server.token
        )

        self.assertEqual((status, body), (404, {"error": "not_found"}))

    def test_page_data_route_names_no_round_after_answers(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)

        status, body = self.server.request("GET", "/api/round", token=self.server.token)

        self.assertEqual((status, body), (200, {"state": "waiting", "round": None}))

    def test_data_request_takes_no_token_from_query_or_path(self) -> None:
        token = self.server.token
        for path in (f"/api/session?token={token}", f"/api/session/{token}"):
            with self.subTest(path):
                status, body = self.server.request("GET", path)

                self.assertEqual(status, 403, body)
                self.assertNotIn(str(self.session), json.dumps(body))

    def test_page_shell_and_script_load_without_token(self) -> None:
        for path, marker in (("/", "<script"), ("/assets/interview/app.js", "X-Interview-Token")):
            with self.subTest(path):
                status, body = self.server.request("GET", path)

                self.assertEqual(status, 200)
                self.assertIn(marker, body)
                self.assertNotIn(self.server.token, body)

    def test_end_answers_waiting_result_request_with_ended(self) -> None:
        responses: list[tuple[int, Any]] = []
        waiting = threading.Thread(
            target=lambda: responses.append(
                self.server.request("GET", "/api/rounds/ROUND-01/result", token=self.server.token)
            )
        )
        waiting.start()
        self.server.wait_for_waiters(1)

        self.server.request("POST", "/api/end", token=self.server.token)
        waiting.join()

        self.assertEqual(responses, [(200, {"state": "ended"})])


class InterviewServerOwnershipTests(InterviewTestCase):
    def test_closed_server_leaves_session_to_later_server(self) -> None:
        files = SessionFiles(self.session)
        create_server(files).server_close()

        later = create_server(files)
        self.addCleanup(later.server_close)

        self.assertEqual(read_state(files)["port"], later.server_address[1])

    def test_server_starts_without_host_name_lookup(self) -> None:
        with mock.patch("socket.getfqdn", side_effect=AssertionError("looked up host name")):
            server = create_server(SessionFiles(self.session))
        self.addCleanup(server.server_close)

        self.assertEqual(read_state(SessionFiles(self.session))["port"], server.server_address[1])


class InterviewSubmitTests(InterviewServerTestCase):
    def round_state(self) -> str:
        return self.server.request("GET", "/api/round", token=self.server.token)[1]["state"]

    def test_submit_without_reason_is_rejected_and_stores_nothing(self) -> None:
        for choice in ("decide_later", "out_of_scope"):
            with self.subTest(choice):
                submit = copy.deepcopy(ROUND_ONE_SUBMIT)
                submit["answers"][0] = {"node": "NODE-03", "choice": choice}

                status, body = self.server.submit(submit)

                self.assertEqual(status, 400, body)
                self.assertEqual([fault["path"] for fault in body["faults"]], ["answers[0].reason"])
                self.assertEqual(self.server.stored_answers(), [])
                self.assertEqual(self.round_state(), "open")

    def test_submit_with_list_or_mapping_in_place_of_text_is_rejected(self) -> None:
        cases = {
            "node list": ({"node": [], "choice": "written", "written": "x"}, "answers[0].node"),
            "node mapping": ({"node": {}, "choice": "written", "written": "x"}, "answers[0].node"),
            "choice list": ({"node": "NODE-03", "choice": []}, "answers[0].choice"),
            "choice mapping": ({"node": "NODE-03", "choice": {}}, "answers[0].choice"),
            "label list": (
                {"node": "NODE-03", "choice": "option", "selected": [[]]},
                "answers[0].selected[0]",
            ),
            "label mapping": (
                {"node": "NODE-03", "choice": "option", "selected": [{}]},
                "answers[0].selected[0]",
            ),
        }
        for name, (answer, path) in cases.items():
            with self.subTest(name):
                submit = copy.deepcopy(ROUND_ONE_SUBMIT)
                submit["answers"][0] = answer

                status, body = self.server.submit(submit)

                self.assertEqual(status, 400, body)
                self.assertIn(path, [fault["path"] for fault in body["faults"]])
                self.assertEqual(self.server.stored_answers(), [])

    def test_submit_that_is_not_a_json_mapping_is_rejected(self) -> None:
        for body in (["ROUND-01"], "ROUND-01"):
            with self.subTest(body):
                status, response = self.server.submit(body)

                self.assertEqual(status, 400, response)
                self.assertEqual(self.server.stored_answers(), [])

    def test_submit_for_a_round_that_is_not_open_is_rejected(self) -> None:
        for round_id in ("ROUND-02", "../ROUND-01", None):
            with self.subTest(round_id):
                status, body = self.server.submit(dict(ROUND_ONE_SUBMIT, round=round_id))

                self.assertEqual(status, 400, body)
                self.assertEqual([fault["path"] for fault in body["faults"]], ["round"])
                self.assertEqual(self.server.stored_answers(), [])

    def test_submit_without_token_or_with_wrong_token_is_forbidden(self) -> None:
        for name, token in (("no token", None), ("wrong token", "not-the-token")):
            with self.subTest(name):
                status, body = self.server.submit(ROUND_ONE_SUBMIT, token=token)

                self.assertEqual(status, 403)
                self.assertEqual(body, {"error": "forbidden"})
                self.assertEqual(self.server.stored_answers(), [])

    def test_second_submit_for_answered_round_is_conflict_and_changes_nothing(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)
        stored = [path.read_bytes() for path in self.server.stored_answers()]
        other = copy.deepcopy(ROUND_ONE_SUBMIT)
        other["answers"][0]["selected"] = ["Session directory"]

        status, body = self.server.submit(other)

        self.assertEqual(status, 409, body)
        self.assertEqual([path.read_bytes() for path in self.server.stored_answers()], stored)

    def test_two_concurrent_submits_store_one_answer_and_conflict_the_other(self) -> None:
        barrier = threading.Barrier(2)
        statuses: list[int] = []

        def submit(selected: str) -> None:
            body = copy.deepcopy(ROUND_ONE_SUBMIT)
            body["answers"][0]["selected"] = [selected]
            barrier.wait()
            statuses.append(self.server.submit(body)[0])

        threads = [
            threading.Thread(target=submit, args=(label,))
            for label in ("Registry", "Session directory")
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(sorted(statuses), [200, 409])
        self.assertEqual(len(self.server.stored_answers()), 1)


class InterviewAnsweredTests(InterviewRoundTestCase):
    def answer(self, round_: dict[str, Any], submit: dict[str, Any]) -> str:
        ask = self.harness.start_ask(self.write_round(round_))
        ask.wait_started()
        self.harness.submit(submit)
        return ask.finish().stdout

    def test_answered_payload_gives_answers_and_record_instructions(self) -> None:
        stdout = self.answer(FIVE_CHOICES_ROUND, FIVE_CHOICES_SUBMIT)

        body = stdout.split("round: ROUND-02\n", 1)[1].split("next[", 1)[0]
        self.assertEqual(body, FIVE_CHOICES_ANSWERS)

    def test_answered_payload_ends_with_next_round_and_end_commands(self) -> None:
        stdout = self.answer(FIVE_CHOICES_ROUND, FIVE_CHOICES_SUBMIT)

        next_ask, end = top_level_array(stdout, "next")
        self.assertIn(f"interview ask {self.session} <next-round-file>", next_ask)
        self.assertIn(f"interview end {self.session}", end)


class InterviewRoundIdentityTests(InterviewRoundTestCase):
    def answer_round_one(self) -> str:
        ask = self.harness.start_ask(self.write_round(ROUND_ONE))
        ask.wait_started()
        self.harness.submit(ROUND_ONE_SUBMIT)
        return ask.finish().stdout

    def test_second_ask_for_answered_round_returns_stored_answers_without_server(self) -> None:
        first = self.answer_round_one()
        pid = self.harness.kill_server()
        calls = self.harness.browser_calls()

        result = self.harness.ask(self.write_round(ROUND_ONE))

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout, first)
        self.assertEqual(result.stderr, "")
        self.assertEqual(self.harness.browser_calls(), calls)
        self.assertEqual(self.harness.server_pid(), pid)

    def test_new_round_after_answered_round_opens_on_same_server_without_browser(self) -> None:
        self.answer_round_one()
        pid = self.harness.server_pid()
        round_two = copy.deepcopy(ROUND_ONE)
        round_two["id"] = "ROUND-02"

        ask = self.harness.start_ask(self.write_round(round_two, "round-02.json"))
        ask.wait_started()
        status, _ = self.harness.submit(dict(ROUND_ONE_SUBMIT, round="ROUND-02"))
        result = ask.finish()

        self.assertEqual(status, 200)
        self.assertEqual(top_level_field(result.stdout, "status"), "answered")
        self.assertEqual(top_level_field(result.stdout, "round"), "ROUND-02")
        self.assertEqual(len(self.harness.browser_calls()), 1)
        self.assertEqual(self.harness.server_pid(), pid)

    def test_changed_round_under_stored_round_id_is_round_changed(self) -> None:
        changed = copy.deepcopy(ROUND_ONE)
        changed["questions"][0]["question"] = "Where do answers live?"
        for state in ("open", "answered"):
            with self.subTest(state):
                if state == "open":
                    self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()
                else:
                    self.harness.submit(ROUND_ONE_SUBMIT)
                stored = self.harness.rounds_dir.joinpath("ROUND-01.json").read_bytes()

                result = self.harness.ask(self.write_round(changed, "changed.json"))

                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertEqual(top_level_field(result.stdout, "code"), "round_changed")
                self.assertEqual(result.stderr, "")
                self.assertEqual(
                    self.harness.rounds_dir.joinpath("ROUND-01.json").read_bytes(), stored
                )

    def test_new_round_while_other_round_is_open_is_round_open(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()
        round_two = copy.deepcopy(ROUND_ONE)
        round_two["id"] = "ROUND-02"

        result = self.harness.ask(self.write_round(round_two, "round-02.json"))

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "round_open")
        self.assertEqual(result.stderr, "")
        retry, end = top_level_array(result.stdout, "next")
        self.assertIn(
            f"interview ask {self.session} {self.harness.rounds_dir}/ROUND-01.json", retry
        )
        self.assertIn(f"interview end {self.session}", end)
        self.assertEqual(
            sorted(p.name for p in self.harness.rounds_dir.iterdir()), ["ROUND-01.json"]
        )

    def test_stored_open_round_file_named_by_round_open_asks_the_open_round(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()

        rerun = self.harness.start_ask(self.harness.rounds_dir / "ROUND-01.json")

        rerun.wait_started()
        self.assertTrue(rerun.is_waiting())

    def test_ask_whose_server_stops_reports_server_stopped_and_rerun_waits_again(self) -> None:
        round_file = self.write_round(ROUND_ONE)
        ask = self.harness.start_ask(round_file)
        ask.wait_started()
        self.harness.kill_server()

        result = ask.finish()
        rerun = self.harness.start_ask(round_file)
        rerun.wait_started()

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "server_stopped")
        self.assertIn(f"interview ask {self.session} {round_file}", result.stdout)
        self.assertTrue(rerun.is_waiting())

    def test_two_concurrent_asks_start_one_server_and_return_same_answers(self) -> None:
        round_file = self.write_round(ROUND_ONE)
        asks = [self.harness.start_ask(round_file) for _ in range(2)]
        for ask in asks:
            ask.wait_started()

        self.harness.submit(ROUND_ONE_SUBMIT)
        first, second = (ask.finish() for ask in asks)

        self.assertEqual(len(self.harness.browser_calls()), 1)
        self.assertEqual(top_level_field(first.stdout, "status"), "answered")
        self.assertEqual(first.stdout, second.stdout)


class InterviewUnresponsiveServerTests(InterviewRoundTestCase):
    """Checks with a server that holds the session but answers no request."""

    # Short request timeouts keep each check within the test time limit.
    PING_SECONDS = 0.05
    STOP_SECONDS = 0.1

    def setUp(self) -> None:
        super().setUp()
        self.round_file = self.write_round(ROUND_ONE)
        self.harness.start_ask(self.round_file).wait_started()
        self.pid = self.harness.pause_server()

    def test_ask_is_server_unresponsive_and_starts_no_second_server(self) -> None:
        with mock.patch.object(client, "PING_SECONDS", self.PING_SECONDS):
            result = self.harness.ask(self.round_file)

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "server_unresponsive")
        self.assertEqual(self.harness.server_pid(), self.pid)
        self.assertEqual(len(self.harness.browser_calls()), 1)

    def test_end_fails_and_keeps_session_active_while_server_runs(self) -> None:
        state = self.harness.state()

        with mock.patch.multiple(
            client, PING_SECONDS=self.PING_SECONDS, STOP_SECONDS=self.STOP_SECONDS
        ):
            result = self.harness.end()

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "server_not_stopped")
        self.assertEqual(self.harness.state(), state)

    def test_end_run_again_after_server_answers_again_stops_server(self) -> None:
        token, port = self.harness.token(), self.harness.port()
        with mock.patch.multiple(
            client, PING_SECONDS=self.PING_SECONDS, STOP_SECONDS=self.STOP_SECONDS
        ):
            self.harness.end()
        self.harness.resume_server(self.pid)

        result = self.harness.end()

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "ended")
        self.assertTrue(wait_for_exit(self.pid), "server process still runs")
        with self.assertRaises(ConnectionRefusedError):
            self.harness.request("GET", "/api/session", token=token, port=port)


class InterviewStalledShutdownTests(InterviewTestCase):
    """Checks with a server that recorded the end but still holds the server lock."""

    def setUp(self) -> None:
        super().setUp()
        self.server = ServerFixture(self, self.session, ROUND_ONE)
        self.harness = InterviewHarness(self, self.root, self.session)
        # serve_forever stops after this request, and the fixture closes the server in cleanup.
        self.server.request("POST", "/api/end", token=self.server.token)

    def test_end_of_ended_session_fails_while_server_holds_session(self) -> None:
        with mock.patch.object(client, "STOP_SECONDS", 0.1):
            result = self.harness.end()

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "server_not_stopped")

    def test_end_run_again_after_server_stops_reports_ended(self) -> None:
        with mock.patch.object(client, "STOP_SECONDS", 0.1):
            self.harness.end()
        self.server.stop()

        result = self.harness.end()

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "ended")


class InterviewEndTests(InterviewRoundTestCase):
    def test_end_stops_server_and_old_token_stops_working(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()
        token, port, pid = self.harness.token(), self.harness.port(), self.harness.server_pid()

        ended = self.harness.end()

        self.assertEqual(ended.returncode, 0, ended.stdout + ended.stderr)
        self.assertEqual(top_level_field(ended.stdout, "status"), "ended")
        self.assertTrue(wait_for_exit(pid), "server process still runs")
        with self.assertRaises(ConnectionRefusedError):
            self.harness.request("GET", "/api/session", token=token, port=port)

    def test_end_makes_waiting_ask_return_ended(self) -> None:
        ask = self.harness.start_ask(self.write_round(ROUND_ONE))
        ask.wait_started()

        self.harness.end()
        result = ask.finish()

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(top_level_field(result.stdout, "status"), "ended")
        self.assertTrue(result.stdout.rstrip("\n").splitlines()[-1].startswith("next["))

    def test_end_after_server_died_records_ended_state(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()
        self.harness.kill_server()
        calls = self.harness.browser_calls()

        ended = self.harness.end()
        result = self.harness.ask(self.write_round(ROUND_ONE))

        self.assertEqual(top_level_field(ended.stdout, "status"), "ended")
        self.assertEqual(top_level_field(result.stdout, "status"), "ended")
        self.assertEqual(self.harness.browser_calls(), calls)

    def test_second_end_gives_same_payload_and_exit_code(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()

        first = self.harness.end()
        second = self.harness.end()

        self.assertEqual(first.returncode, 0, first.stdout)
        self.assertEqual((second.returncode, second.stdout), (first.returncode, first.stdout))
        self.assertEqual(second.stderr, "")

    def test_ask_after_end_returns_ended_without_server_or_browser(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()
        self.harness.end()
        calls_before = len(self.harness.browser_calls())
        round_two = dict(ROUND_ONE, id="ROUND-02")

        result = self.harness.ask(self.write_round(round_two, "round-02.json"))

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(top_level_field(result.stdout, "status"), "ended")
        self.assertEqual(len(self.harness.browser_calls()), calls_before)
        self.assertNotIn("pid", self.harness.state())
        self.assertNotIn("token", self.harness.state())

    def test_end_without_session_is_no_session_error(self) -> None:
        result = self.harness.end()

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "no_session")
        self.assertIn("interview ask", top_level_array(result.stdout, "next")[0])
        self.assertFalse(self.harness.state_file.exists())


if __name__ == "__main__":
    unittest.main()
