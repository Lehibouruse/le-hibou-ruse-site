#!/usr/bin/env python3
"""Inspect a generated background for text that must be added in postproduction.

Requires rapidocr_onnxruntime in the interpreter used to launch this script.
The result is a review signal, not proof that an image is semantically correct.
"""

import hashlib
import json
import re
import sys
from pathlib import Path


def classify_rows(rows):
    findings = []
    for row in rows or []:
        box, label, confidence = row
        confidence = float(confidence)
        compact = re.sub(r"\s+", "", str(label))
        if confidence < 0.90:
            continue
        numeric = re.findall(r"\d{2,}", compact)
        words = re.findall(r"[A-Za-zÀ-ÿ]{4,}", compact)
        if not numeric and not words:
            continue
        numeric_long = any(len(value) >= 4 for value in numeric)
        findings.append({
            "text": str(label),
            "confidence": round(confidence, 4),
            "box": box,
            "kind": "numeric_glyph" if numeric_long else (
                "short_numeric_glyph" if numeric else "word_glyph"
            ),
        })
    status = "REJECT" if any(item["kind"] == "numeric_glyph" for item in findings) else (
        "REVIEW" if findings else "PASS"
    )
    return {"status": status, "findings": findings}


def inspect_image(path):
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as error:
        raise RuntimeError("rapidocr_onnxruntime unavailable; generated text QC cannot pass") from error
    image = Path(path).resolve(strict=True)
    rows, _ = RapidOCR()(str(image))
    result = classify_rows(rows)
    return {
        "schema": "HIBOU_GENERATED_TEXT_QC_V1",
        "file": str(image),
        "sha256": hashlib.sha256(image.read_bytes()).hexdigest(),
        "expected_policy": "text_free_generated_background",
        **result,
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) not in (2, 3):
        raise SystemExit("usage: video-generated-text-qc.py image.png [result.json]")
    result = inspect_image(sys.argv[1])
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if len(sys.argv) == 3:
        Path(sys.argv[2]).write_text(payload + "\n", encoding="utf-8")
    print(payload)
    raise SystemExit(0 if result["status"] == "PASS" else 2)
