import unittest
from slug import slugify


class SlugifyTest(unittest.TestCase):
    def test_lowercases(self):
        self.assertEqual(slugify("Hello"), "hello")


if __name__ == "__main__":
    unittest.main()
