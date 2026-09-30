#!/usr/bin/env python3
"""Local semantic creative QC for Le Hibou Rusé.

No paid fallback. Model loading is local-files-only by default so a production
worker never silently downloads or calls a remote inference API.
"""
from __future__ import annotations
import argparse, json, math, os, re
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
        vision_outputs = model.vision_model(pixel_values=pixel_values)
        pooled = vision_outputs.pooler_output
        return model.visual_projection(pooled)

def text_embedding(model, processor, device, torch, text: str):
    inputs = processor(text=[text], return_tensors="pt", padding=True, truncation=True, max_length=77)
    ids = inputs["input_ids"].to(device)
    mask = inputs.get("attention_mask")
    if mask is not None:
        mask = mask.to(device)
    with torch.inference_mode():
        text_outputs = model.text_model(input_ids=ids, attention_mask=mask)
        pooled = text_outputs.pooler_output
        return model.text_projection(pooled)

def chunk_text(text: str, max_chars: int = 220):
    """Cover an entire creative brief with CLIP-sized semantic chunks.

    CLIP text encoders have a short context window. Splitting by semantic
    boundaries prevents requirements near the end of a long visual brief from
    being silently ignored by QC.
    """
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if not normalized:
        return []
    raw_parts = [p.strip() for p in re.split(r"(?<=[.!?;:])\s+|\n+", normalized) if p.strip()]
    chunks = []
    current = ""
    for part in raw_parts:
        words = part.split()
        if len(part) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            piece = ""
            for word in words:
                candidate = (piece + " " + word).strip()
                if piece and len(candidate) > max_chars:
                    chunks.append(piece)
                    piece = word
                else:
                    piece = candidate
            if piece:
                chunks.append(piece)
            continue
        candidate = (current + " " + part).strip()
        if current and len(candidate) > max_chars:
            chunks.append(current)
            current = part
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [normalized]

def chunked_similarity(image, model, processor, device, torch, text: str):
    chunks = chunk_text(text)
    if not chunks:
        return None, None, 0
    values = [
        sim01(image, text_embedding(model, processor, device, torch, chunk))
        for chunk in chunks
    ]
    return float(sum(values) / len(values)), float(min(values)), len(values)

def sim01(a, b):
    return clamp01((cosine(a, b) + 1.0) / 2.0)

def evaluate_scene(scene, model, processor, device, torch, canonical_embedding=None, thresholds=None):
    thresholds = thresholds or {}
    image_path = Path(scene["image"]).expanduser().resolve()
    if not image_path.exists():
        return {
            "scene_id": scene.get("scene_id"),
            "candidate_id": scene.get("candidate_id"),
            "pass": False,
            "scores": {},
            "reasons": [f"image missing: {image_path}"],
        }

    image = image_embedding(model, processor, device, torch, image_path)
    brief = str(scene.get("brief") or scene.get("visual_idea") or "").strip()
    style = str(scene.get("style_prompt") or "premium editorial flat illustration, clean vector-like shapes, ivory background, dark navy, teal and restrained gold accents").strip()
    expected_hibou = scene.get("expected_hibou")
    hibou_composited_later = bool(scene.get("hibou_composited_later"))
    allow_postproduction_text = bool(scene.get("allow_postproduction_text"))
    if hibou_composited_later:
        expected_hibou = False
    scores = {}

    text_coverage = {}
    if brief:
        semantic_mean, semantic_min, semantic_chunks = chunked_similarity(
            image, model, processor, device, torch, brief
        )
        scores["semantic_brief"] = semantic_mean
        scores["semantic_brief_min_chunk"] = semantic_min
        text_coverage["semantic_brief_chunks"] = semantic_chunks
    style_mean, style_min, style_chunks = chunked_similarity(
        image, model, processor, device, torch, style
    )
    scores["global_style"] = style_mean
    scores["global_style_min_chunk"] = style_min
    text_coverage["global_style_chunks"] = style_chunks

    owl_prompt = "a stylized owl character, the canonical Le Hibou Ruse mascot"
    animal_prompt = "an animal or anthropomorphic character"
    objects_prompt = "an empty editorial financial diagram made only of geometric shapes and objects"
    gibberish_prompt = "random illegible text, gibberish letters, accidental watermark, malformed typography"
    scores["hibou_presence"] = sim01(image, text_embedding(model, processor, device, torch, owl_prompt))
    scores["animal_presence"] = sim01(image, text_embedding(model, processor, device, torch, animal_prompt))
    scores["objects_only"] = sim01(image, text_embedding(model, processor, device, torch, objects_prompt))
    scores["unexpected_character_contrast"] = max(
        scores["animal_presence"] - scores["objects_only"],
        scores["hibou_presence"] - scores["objects_only"],
    )
    scores["text_artifact_risk"] = sim01(image, text_embedding(model, processor, device, torch, gibberish_prompt))
    if canonical_embedding is not None:
        scores["canonical_identity"] = sim01(image, canonical_embedding)

    min_semantic = float(thresholds.get("semantic_brief_min", 0.53))
    min_style = float(thresholds.get("global_style_min", 0.52))
    min_hibou = float(thresholds.get("hibou_presence_min", 0.52))
    max_animal = float(thresholds.get("unexpected_animal_max", 0.57))
    max_character_contrast = float(thresholds.get("unexpected_character_contrast_max", 0.005))
    min_identity = float(thresholds.get("canonical_identity_min", 0.55))
    max_text_risk = float(thresholds.get("text_artifact_risk_max", 0.62))

    reasons = []
    if brief and scores.get("semantic_brief", 1) < min_semantic:
        reasons.append(f"semantic mismatch: {scores['semantic_brief']:.3f} < {min_semantic:.3f}")
    if scores["global_style"] < min_style:
        reasons.append(f"style drift: {scores['global_style']:.3f} < {min_style:.3f}")
    if expected_hibou is True and scores["hibou_presence"] < min_hibou:
        reasons.append(f"Hibou expected but weakly detected: {scores['hibou_presence']:.3f} < {min_hibou:.3f}")
    if expected_hibou is False and scores["unexpected_character_contrast"] > max_character_contrast:
        reasons.append(
            f"unexpected character contrast: {scores['unexpected_character_contrast']:.3f} > {max_character_contrast:.3f}"
        )
    if expected_hibou is True and "canonical_identity" in scores and scores["canonical_identity"] < min_identity:
        reasons.append(f"canonical Hibou drift: {scores['canonical_identity']:.3f} < {min_identity:.3f}")
    if not allow_postproduction_text and scores["text_artifact_risk"] > max_text_risk:
        reasons.append(f"possible parasitic/fake text: {scores['text_artifact_risk']:.3f} > {max_text_risk:.3f}")

    return {
        "scene_id": scene.get("scene_id"),
        "candidate_id": scene.get("candidate_id"),
        "image": str(image_path),
        "pass": not reasons,
        "scores": {k: round(v, 4) for k, v in scores.items()},
        "text_coverage": text_coverage,
        "allow_postproduction_text": allow_postproduction_text,
        "reasons": reasons,
        "thresholds": {
            "semantic_brief_min": min_semantic,
            "global_style_min": min_style,
            "hibou_presence_min": min_hibou,
            "unexpected_animal_max": max_animal,
            "unexpected_character_contrast_max": max_character_contrast,
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
        "prompt_contract_ref": payload.get("prompt_contract_ref"),
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
