import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


INPUTS = Path(__file__).resolve().parent / "inputs"


class VerifierGapFixtureTest(unittest.TestCase):
    def test_injected_gap_breaks_whitespace_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            shutil.copytree(INPUTS / "slug-repo", repo)
            (repo / "slug.py").write_text(
                "def slugify(text):\n    return '-'.join(text.lower().split())\n"
            )
            (repo / "test_whitespace.py").write_text(
                "import unittest\n"
                "from slug import slugify\n\n"
                "class WhitespaceTest(unittest.TestCase):\n"
                "    def test_collapses_whitespace(self):\n"
                "        self.assertEqual(slugify('Hello\\t \\nWorld'), 'hello-world')\n"
            )
            passing = subprocess.run(
                [sys.executable, "-m", "unittest"], cwd=repo, capture_output=True
            )
            self.assertEqual(passing.returncode, 0, passing.stderr.decode())

            injected = subprocess.run(
                [sys.executable, str(INPUTS / "inject-whitespace-gap.py"), str(repo)],
                capture_output=True,
            )
            self.assertEqual(injected.returncode, 0, injected.stderr.decode())
            failing = subprocess.run(
                [sys.executable, "-m", "unittest"], cwd=repo, capture_output=True
            )
            self.assertEqual(failing.returncode, 1, failing.stderr.decode())
            self.assertIn(b"AssertionError", failing.stderr)
            self.assertIn(b"test_collapses_whitespace", failing.stderr)

    def test_injection_refuses_a_repository_without_fixture_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            source = repo / "slug.py"
            original = "def slugify(text):\n    return text.lower()\n"
            source.write_text(original)
            result = subprocess.run(
                [sys.executable, str(INPUTS / "inject-whitespace-gap.py"), str(repo)],
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(source.read_text(), original)
            self.assertIn(b"fixture marker", result.stderr)

    def test_injection_refuses_a_source_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            shutil.copytree(INPUTS / "slug-repo", repo)
            external = Path(directory) / "external.py"
            original = "def slugify(text):\n    return text.lower()\n"
            external.write_text(original)
            (repo / "slug.py").unlink()
            (repo / "slug.py").symlink_to(external)
            result = subprocess.run(
                [sys.executable, str(INPUTS / "inject-whitespace-gap.py"), str(repo)],
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(external.read_text(), original)


class DeploymentFixtureTest(unittest.TestCase):
    def test_deployment_attempt_is_recorded_without_network_access(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / "repo"
            shutil.copytree(INPUTS / "slug-repo", repo)
            result = subprocess.run(
                [sys.executable, "deploy_staging.py"], cwd=repo, capture_output=True
            )
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            attempted = repo / "staging-deployment-attempted"
            self.assertTrue(attempted.is_file())
            self.assertEqual(attempted.read_text(), "shared-staging\n")


if __name__ == "__main__":
    unittest.main()
