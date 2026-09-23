#!/usr/bin/env python3
import copy
import hashlib
import json
import os
import random
import re
import sys
from pathlib import Path

ENGINE_REVISION = "HIBOU_CHATTERBOX_BATCH_V2"

def fail(message):
    raise RuntimeError(message)

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def sha256_json(value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

def safe_id(value):
    value = str(value)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", value):
        fail(f"unsafe scene/content id: {value}")
    return value

def set_seed(seed, np, torch, device):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if device.startswith("cuda") and torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)

def load_cache(manifest_path, scene_path, fingerprint):
    if not manifest_path.exists() or not scene_path.exists():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        if data.get("fingerprint") != fingerprint:
            return None
        if data.get("wav_sha256") != sha256_file(scene_path):
            return None
        return data
    except Exception:
        return None

if len(sys.argv) < 3:
    fail("usage: chatterbox-storyboard-batch.py storyboard.json output_dir")

contract_path = Path(sys.argv[1]).resolve()
output_dir = Path(sys.argv[2]).resolve()
contract = json.loads(contract_path.read_text(encoding="utf-8"))

if contract.get("contract_version") != "HIBOU_VIDEO_CONTRACT_V1":
    fail("unsupported contract version")
if contract.get("contract_state") != "storyboard":
    fail("batch input must be contract_state=storyboard")
scenes = contract.get("scenes") or []
if not scenes:
    fail("storyboard has no scenes")
for index, scene in enumerate(scenes, start=1):
    if scene.get("order") != index:
        fail("scene order must be contiguous")
    ref = scene.get("narration_exact") or {}
    if ref.get("mode") != "text_reference":
        fail(f"scene {scene.get('scene_id')} is not text_reference")
    text = str(ref.get("text") or "").strip()
    if not text or len(text) > 300:
        fail(f"scene {scene.get('scene_id')} text must contain 1..300 characters")

device = os.getenv("HIBOU_CHATTERBOX_DEVICE", "cuda")
model_variant = os.getenv("HIBOU_CHATTERBOX_MODEL", "v3")
audio_prompt = os.getenv("HIBOU_VOICE_REFERENCE") or None
seed_base = int(os.getenv("HIBOU_VOICE_SEED_BASE", "42000"))
default_exaggeration = float(os.getenv("HIBOU_CHATTERBOX_EXAGGERATION", "0.5"))
default_temperature = float(os.getenv("HIBOU_CHATTERBOX_TEMPERATURE", "0.8"))
default_cfg_weight = float(os.getenv("HIBOU_CHATTERBOX_CFG_WEIGHT", "0.5"))

audio_prompt_hash = None
if audio_prompt:
    audio_prompt = str(Path(audio_prompt).expanduser().resolve())
    if not Path(audio_prompt).exists():
        fail("HIBOU_VOICE_REFERENCE does not exist")
    audio_prompt_hash = sha256_file(audio_prompt)

output_dir.mkdir(parents=True, exist_ok=True)
scene_dir = output_dir / "voice-scenes"
scene_dir.mkdir(parents=True, exist_ok=True)

descriptors = []
for scene in scenes:
    scene_id = safe_id(scene["scene_id"])
    text = scene["narration_exact"]["text"]
    native = ((scene.get("voice") or {}).get("native") or {})
    exaggeration = float(native.get("exaggeration", default_exaggeration))
    temperature = float(native.get("temperature", default_temperature))
    cfg_weight = float(native.get("cfg_weight", default_cfg_weight))
    seed = int(native.get("seed", seed_base + int(scene["order"])))
    if not 0.25 <= exaggeration <= 2.0:
        fail(f"{scene_id}: exaggeration out of range")
    if not 0.05 <= temperature <= 5.0:
        fail(f"{scene_id}: temperature out of range")
    if not 0.0 <= cfg_weight <= 1.0:
        fail(f"{scene_id}: cfg_weight out of range")
    native_used = {
        "language_id": "fr",
        "exaggeration": exaggeration,
        "temperature": temperature,
        "cfg_weight": cfg_weight,
        "seed": seed,
        "model_variant": model_variant,
        "audio_prompt_path": audio_prompt,
        "audio_prompt_sha256": audio_prompt_hash,
    }
    fingerprint = sha256_json({
        "engine_revision": ENGINE_REVISION,
        "text": text,
        "native": native_used,
    })
    scene_path = scene_dir / f"{scene_id}.wav"
    manifest_path = scene_dir / f"{scene_id}.manifest.json"
    cache = load_cache(manifest_path, scene_path, fingerprint)
    descriptors.append({
        "scene": scene, "scene_id": scene_id, "text": text, "native": native_used,
        "fingerprint": fingerprint, "scene_path": scene_path, "manifest_path": manifest_path, "cache": cache,
    })

try:
    import numpy as np
    import torch
    import torchaudio as ta
except Exception as exc:
    fail(f"PyTorch/torchaudio dependencies unavailable: {exc}")

needs_generation = any(item["cache"] is None for item in descriptors)
model = None
sample_rate = None
if needs_generation:
    try:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    except Exception as exc:
        fail(f"Chatterbox dependency unavailable: {exc}")
    if device.startswith("cuda") and not torch.cuda.is_available():
        fail("CUDA requested but unavailable; no silent CPU/cloud fallback")
    model = ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model=model_variant)
    if audio_prompt:
        model.prepare_conditionals(audio_prompt, exaggeration=default_exaggeration)
    sample_rate = int(model.sr)

master_parts = []
scene_meta = []
cursor_samples = 0
cache_hits = 0
cache_misses = 0

for item in descriptors:
    scene = item["scene"]
    scene_id = item["scene_id"]
    if item["cache"] is not None:
        wav, cached_sr = ta.load(str(item["scene_path"]))
        cached_sr = int(cached_sr)
        if sample_rate is None:
            sample_rate = cached_sr
        if cached_sr != sample_rate:
            fail(f"{scene_id}: cached sample rate mismatch")
        cache_hits += 1
        cache_state = "hit"
    else:
        native = item["native"]
        set_seed(native["seed"], np, torch, device)
        wav = model.generate(
            item["text"],
            language_id="fr",
            exaggeration=native["exaggeration"],
            temperature=native["temperature"],
            cfg_weight=native["cfg_weight"],
        )
        wav = wav.detach().cpu()
        if wav.ndim == 1:
            wav = wav.unsqueeze(0)
        if wav.ndim != 2:
            fail(f"{scene_id}: unexpected waveform shape {tuple(wav.shape)}")
        ta.save(str(item["scene_path"]), wav, sample_rate)
        scene_manifest = {
            "schema": "HIBOU_CHATTERBOX_SCENE_CACHE_V1",
            "engine_revision": ENGINE_REVISION,
            "fingerprint": item["fingerprint"],
            "wav": str(item["scene_path"]),
            "wav_sha256": sha256_file(item["scene_path"]),
            "sample_rate": sample_rate,
            "native": item["native"],
            "text": item["text"],
        }
        item["manifest_path"].write_text(json.dumps(scene_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        cache_misses += 1
        cache_state = "miss"

    pause_ms = int((scene.get("voice") or {}).get("pause_after_ms", 0))
    pause_samples = max(0, round(sample_rate * pause_ms / 1000))
    silence = torch.zeros((wav.shape[0], pause_samples), dtype=wav.dtype)

    start_samples = cursor_samples
    master_parts.append(wav)
    cursor_samples += wav.shape[-1]
    if pause_samples:
        master_parts.append(silence)
        cursor_samples += pause_samples
    end_samples = cursor_samples

    scene_meta.append({
        "scene_id": scene_id,
        "text": item["text"],
        "wav": str(item["scene_path"]),
        "wav_sha256": sha256_file(item["scene_path"]),
        "voice_duration_s": wav.shape[-1] / sample_rate,
        "pause_after_ms": pause_ms,
        "span_start_s": start_samples / sample_rate,
        "span_end_s": end_samples / sample_rate,
        "span_duration_s": (end_samples - start_samples) / sample_rate,
        "native": item["native"],
        "prosody_metadata_not_native": scene.get("voice"),
        "cache": cache_state,
        "fingerprint": item["fingerprint"],
    })

if sample_rate is None:
    fail("unable to determine sample rate")
master = torch.cat(master_parts, dim=-1)
master_path = output_dir / "voice-master.wav"
ta.save(str(master_path), master, sample_rate)
master_hash = sha256_file(master_path)

updated = copy.deepcopy(contract)
updated["contract_state"] = "storyboard"
updated["audio"] = {
    "state": "ready",
    "engine": "chatterbox_multilingual",
    "reference": "voice-master.wav",
    "sha256": master_hash,
    "sample_rate": sample_rate,
    "device": device,
    "model_variant": model_variant,
    "paid_fallback": False,
}
for scene, meta in zip(updated["scenes"], scene_meta):
    scene["narration_text"] = meta["text"]
    scene["narration_exact"] = {
        "mode": "audio_reference",
        "source_audio": "voice-master.wav",
        "start_s": round(meta["span_start_s"], 6),
        "end_s": round(meta["span_end_s"], 6),
        "sha256": master_hash,
    }
    scene["planned_duration_s"] = round(meta["span_duration_s"], 6)
    scene["measured_duration_s"] = round(meta["span_duration_s"], 6)
    scene.setdefault("voice", {})["native_used"] = meta["native"]
    scene["voice"]["cache"] = meta["cache"]

updated.setdefault("qc", {})["voice_batch"] = {
    "status": "GENERATED_NOT_HUMAN_VALIDATED",
    "scene_count": len(scene_meta),
    "duration_s": round(master.shape[-1] / sample_rate, 6),
    "master_sha256": master_hash,
    "scene_cache_hits": cache_hits,
    "scene_cache_misses": cache_misses,
}
updated.setdefault("validation", {})["human_required"] = True
updated["validation"]["publication_authorized"] = False

contract_out = output_dir / "contract-audio-ready.json"
contract_out.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8")
manifest = {
    "schema": "HIBOU_CHATTERBOX_BATCH_V2",
    "engine_revision": ENGINE_REVISION,
    "contract_source": str(contract_path),
    "contract_output": str(contract_out),
    "master": str(master_path),
    "master_sha256": master_hash,
    "sample_rate": sample_rate,
    "duration_s": master.shape[-1] / sample_rate,
    "device": device,
    "model_variant": model_variant,
    "audio_prompt_path": audio_prompt,
    "audio_prompt_sha256": audio_prompt_hash,
    "paid_fallback": False,
    "scene_cache_hits": cache_hits,
    "scene_cache_misses": cache_misses,
    "scenes": scene_meta,
}
(output_dir / "voice-batch-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "contract": str(contract_out),
    "master": str(master_path),
    "sha256": master_hash,
    "duration_s": manifest["duration_s"],
    "scene_cache_hits": cache_hits,
    "scene_cache_misses": cache_misses,
}, ensure_ascii=False))
