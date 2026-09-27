#!/usr/bin/env python3
"""Local semantic creative QC for Le Hibou Rusé.

No paid fallback. Model loading is local-files-only by default so a production
worker never silently downloads or calls a remote inference API.
"""
from __future__ import annotations
import argparse, json, math, os
from pathlib import Path

SCHEMA = "HIBOU_CREATIVE_QC_V1"
DEFAULT_MODEL = os.getenv("HIBOU_CREATIVE_QC_MODEL", "openai/clip-vit-base-patch32")

def clamp01(v):
    return max(0.0, min(1.0, float(v)))

def cosine(a, b):
    import torch
    a = a / a.norm(dim=-1, keepdim=True).clamp_min(1e-12)
    b = b / b.norm(dim=-1, keepdim=True).clamp_min(1e-12)
    return float((a * b).sum(dim=-1).mean().item())

def load_backend(model_id: str, allow_download: bool):
    try:
        import torch
        from transformers import CLIPModel, CLIPProcessor
    except Exception as exc:
        raise RuntimeError(
            "creative QC requires torch + transformers; install locally, no cloud fallback is used"
        ) from exc
    kwargs = {"local_files_only": not allow_download}
    model = CLIPModel.from_pretrained(model_id, **kwargs)
    processor = CLIPProcessor.from_pretrained(model_id, **kwargs)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device).eval()
    return model, processor, device, torch

def image_embedding(model, processor, device, torch, image_path: Path):
    from PIL import Image
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    pixel_values = inputs["pixel_values"].to(device)
    with torch.inference_mode():
        return model.get_image_features(pixel_values=pixel_values)

def text_embedding(model, processor, device, torch, text: str):
    inputs = processor(text=[text], return_tensors="pt", padding=True)
    ids = inputs["input_ids"].to(device)
    mask = inputs.get("attention_mask")
    if mask is not None:
        mask = mask.to(device)
    with torch.inference_mode():
        return model.get_text_features(input_ids=ids, attention_mask=mask)

def sim01(a, b):
    return clamp01((cosine(a, b) + 1.0) / 2.0)

def evaluate_scene(scene, model, processor, device, torch, canonical_embedding=None, thresholds=None):
    thresholds = thresholds or {}
    image_path = Path(scene["image"]).expanduser().resolve()
    if not image_path.exists():
        return {
            "scene_id": scene.get("scene_id"),
            "pass": False,
            "scores": {},
            "reasons": [f"image missing: {image_path}"],
        }

    image = image_embedding(model, processor, device, torch, image_path)
    brief = str(scene.get("brief") or scene.get("visual_idea") or "").strip()
    style = str(scene.get("style_prompt") or "premium editorial flat illustration, clean vector-like shapes, ivory background, dark navy, teal and restrained gold accents").strip()
    expected_hibou = scene.get("expected_hibou")
    scores = {}

    if brief:
        scores["semantic_brief"] = sim01(image, text_embedding(model, processor, device, torch, brief))
    scores["global_style"] = sim01(image, text_embedding(model, processor, device, torch, style))

    owl_prompt = "a stylized owl character, the canonical Le Hibou Ruse mascot"
    animal_prompt = "an animal or anthropomorphic character"
    gibberish_prompt = "random illegible text, gibberish letters, accidental watermark, malformed typography"
    scores["hibou_presence"] = sim01(image, text_embedding(model, processor, device, torch, owl_prompt))
    scores["animal_presence"] = sim01(image, text_embedding(model, processor, device, torch, animal_prompt))
    scores["text_artifact_risk"] = sim01(image, text_embedding(model, processor, device, torch, gibberish_prompt))
    if canonical_embedding is not None:
        scores["canonical_identity"] = sim01(image, canonical_embedding)

    min_semantic = float(thresholds.get("semantic_brief_min", 0.53))
    min_style = float(thresholds.get("global_style_min", 0.52))
    min_hibou = float(thresholds.get("hibou_presence_min", 0.52))
    max_animal = float(thresholds.get("unexpected_animal_max", 0.57))
    min_identity = float(thresholds.get("canonical_identity_min", 0.55))
    max_text_risk = float(thresholds.get("text_artifact_risk_max", 0.62))

    reasons = []
    if brief and scores.get("semantic_brief", 1) < min_semantic:
        reasons.append(f"semantic mismatch: {scores['semantic_brief']:.3f} < {min_semantic:.3f}")
    if scores["global_style"] < min_style:
        reasons.append(f"style drift: {scores['global_style']:.3f} < {min_style:.3f}")
    if expected_hibou is True and scores["hibou_presence"] < min_hibou:
        reasons.append(f"Hibou expected but weakly detected: {scores['hibou_presence']:.3f} < {min_hibou:.3f}")
    if expected_hibou is False and scores["animal_presence"] > max_animal:
        reasons.append(f"animal/character not expected: {scores['animal_presence']:.3f} > {max_animal:.3f}")
    if expected_hibou is True and "canonical_identity" in scores and scores["canonical_identity"] < min_identity:
        reasons.append(f"canonical Hibou drift: {scores['canonical_identity']:.3f} < {min_identity:.3f}")
    if scores["text_artifact_risk"] > max_text_risk:
        reasons.append(f"possible parasitic/fake text: {scores['text_artifact_risk']:.3f} > {max_text_risk:.3f}")

    return {
        "scene_id": scene.get("scene_id"),
        "image": str(image_path),
        "pass": not reasons,
        "scores": {k: round(v, 4) for k, v in scores.items()},
        "reasons": reasons,
        "thresholds": {
            "semantic_brief_min": min_semantic,
            "global_style_min": min_style,
            "hibou_presence_min": min_hibou,
            "unexpected_animal_max": max_animal,
            "canonical_identity_min": min_identity,
            "text_artifact_risk_max": max_text_risk,
        },
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--output", required=True)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--allow-model-download", action="store_true")
    args = ap.parse_args()

    payload = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    scenes = payload.get("scenes") or []
    if not scenes:
        raise SystemExit("creative QC manifest contains no scenes")

    model, processor, device, torch = load_backend(args.model, args.allow_model_download)
    canonical = payload.get("canonical_hibou")
    canonical_embedding = None
    if canonical:
        p = Path(canonical).expanduser().resolve()
        if p.exists():
            canonical_embedding = image_embedding(model, processor, device, torch, p)

    results = [
        evaluate_scene(
            scene, model, processor, device, torch,
            canonical_embedding=canonical_embedding,
            thresholds=payload.get("thresholds") or {},
        )
        for scene in scenes
    ]
    failed = [r for r in results if not r["pass"]]
    report = {
        "schema": SCHEMA,
        "model": args.model,
        "device": device,
        "local_only": True,
        "paid_fallback": False,
        "human_review_required": True,
        "auto_publish_allowed": False,
        "status": "PASS" if not failed else "REJECT",
        "scene_count": len(results),
        "failed_scene_count": len(failed),
        "scenes": results,
    }
    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "status": report["status"], "output": str(out)}))

if __name__ == "__main__":
    main()
