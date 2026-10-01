"""Pure classification tests; no OCR model or image load is needed."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "video-generated-text-qc.py"
spec = importlib.util.spec_from_file_location("video_generated_text_qc", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GeneratedTextClassificationTests(unittest.TestCase):
    def row(self, label, confidence=0.99):
        return [[[0, 0], [10, 0], [10, 10], [0, 10]], label, confidence]

    def test_empty_background_passes(self):
        self.assertEqual(module.classify_rows([])["status"], "PASS")

    def test_short_numbers_require_review(self):
        result = module.classify_rows([self.row("29"), self.row("202")])
        self.assertEqual(result["status"], "REVIEW")
        self.assertEqual([item["kind"] for item in result["findings"]],
                         ["short_numeric_glyph", "short_numeric_glyph"])

    def test_long_generated_number_is_rejected(self):
        result = module.classify_rows([self.row("28176")])
        self.assertEqual(result["status"], "REJECT")
        self.assertEqual(result["findings"][0]["kind"], "numeric_glyph")

    def test_long_word_requires_review(self):
        result = module.classify_rows([self.row("Banque")])
        self.assertEqual(result["status"], "REVIEW")

    def test_low_confidence_or_single_digit_is_ignored(self):
        result = module.classify_rows([self.row("2025", 0.89), self.row("2")])
        self.assertEqual(result["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
