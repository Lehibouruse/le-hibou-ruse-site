#!/usr/bin/env python3
import copy
import gc
import hashlib
import inspect
import importlib.metadata
import json
import os
import random
import re
import sys
import subprocess
from pathlib import Path

ENGINE_REVISION = "HIBOU_CHATTERBOX_BATCH_V3_PROSODY"

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

def speech_word_count(text):
    return len(re.findall(r"[0-9A-Za-zÀ-ÖØ-öø-ÿ]+(?:[’'][0-9A-Za-zÀ-ÖØ-öø-ÿ]+)*", str(text or "")))

def duration_bounds(text, target_wpm):
    words = speech_word_count(text)
    try:
        wpm = float(target_wpm or 170)
    except Exception:
        wpm = 170.0
    wpm = max(80.0, min(240.0, wpm))
    expected = (words * 60.0 / wpm) if words else 0.0
    return {
        "word_count": words,
        "target_wpm": wpm,
        "expected_duration_s": expected,
        "min_duration_s": max(0.45, expected * 0.42),
        "max_duration_s": max(3.5, expected * 2.6 + 2.0),
    }

def duration_is_plausible(duration_s, bounds):
    try:
        value = float(duration_s)
    except Exception:
        return False
    return (
        value > 0
        and value >= float(bounds["min_duration_s"])
        and value <= float(bounds["max_duration_s"])
    )

def load_cache(manifest_path, scene_path, fingerprint, bounds):
    if not manifest_path.exists() or not scene_path.exists():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        if data.get("fingerprint") != fingerprint:
            return None
        if data.get("wav_sha256") != sha256_file(scene_path):
            return None
        if not duration_is_plausible(data.get("voice_duration_s"), bounds):
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
voice_contract = contract.get("audio") or {}
voice_profile_id = str(voice_contract.get("voice_profile_id") or "VOICE_V4_ORIGINAL").strip()
voice_profile_text = str(voice_contract.get("voice_profile_text") or "").strip()
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
        "model_variant_native": None,
        "audio_prompt_path": audio_prompt,
        "audio_prompt_sha256": audio_prompt_hash,
    }
    prosody_plan = ((scene.get("voice") or {}).get("prosody_plan") or {})
    prosody_units = prosody_plan.get("units") if prosody_plan.get("schema") == "HIBOU_PROSODY_PLAN_V1" else None
    if prosody_units:
        if prosody_plan.get("mode") != "verbatim_segmented" or prosody_plan.get("lexical_transform") is not False:
            fail(f"{scene_id}: invalid prosody plan mode")
        source_spans = "".join(str(unit.get("source_span") or "") for unit in prosody_units)
        if source_spans != text:
            fail(f"{scene_id}: prosody plan does not preserve exact verbatim source")
    fingerprint = sha256_json({
        "engine_revision": ENGINE_REVISION,
        "text": text,
        "native": native_used,
        "prosody_units": prosody_units,
    })
    scene_path = scene_dir / f"{scene_id}.wav"
    manifest_path = scene_dir / f"{scene_id}.manifest.json"
    target_wpm = (scene.get("voice") or {}).get("target_wpm", 170)
    scene_duration_bounds = duration_bounds(text, target_wpm)
    cache = load_cache(manifest_path, scene_path, fingerprint, scene_duration_bounds)
    descriptors.append({
        "scene": scene, "scene_id": scene_id, "text": text, "native": native_used,
        "prosody_units": prosody_units,
        "fingerprint": fingerprint, "scene_path": scene_path, "manifest_path": manifest_path, "cache": cache,
        "duration_bounds": scene_duration_bounds,
    })

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

try:
    import numpy as np
    import torch
    import torchaudio as ta
except Exception as exc:
    fail(f"PyTorch/torchaudio dependencies unavailable: {exc}")

def clear_cuda_cache():
    gc.collect()
    if device.startswith("cuda") and torch.cuda.is_available():
        torch.cuda.empty_cache()

def generate_scene(model, text, native, scene_id):
    clear_cuda_cache()
    try:
        return model.generate(
            text,
            language_id="fr",
            exaggeration=native["exaggeration"],
            temperature=native["temperature"],
            cfg_weight=native["cfg_weight"],
        )
    except RuntimeError as exc:
        message = str(exc)
        if device.startswith("cuda") and re.search(r"out of memory|cuda error|cublas_status_alloc_failed", message, re.I):
            clear_cuda_cache()
            try:
                return model.generate(
                    text,
                    language_id="fr",
                    exaggeration=native["exaggeration"],
                    temperature=native["temperature"],
                    cfg_weight=native["cfg_weight"],
                )
            except Exception as retry_exc:
                fail(f"{scene_id}: CUDA voice generation failed after one cleanup retry: {retry_exc}")
        fail(f"{scene_id}: voice generation failed: {exc}")

def atempo_waveform(wav, sample_rate, factor, scene_id, unit_id):
    factor = max(0.85, min(1.15, float(factor)))
    if abs(factor - 1.0) < 0.001:
        return wav
    temp_in = scene_dir / f".{scene_id}-{unit_id}-atempo-in.wav"
    temp_out = scene_dir / f".{scene_id}-{unit_id}-atempo-out.wav"
    try:
        ta.save(str(temp_in), wav.detach().cpu(), sample_rate)
        result = subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(temp_in),
             "-filter:a", f"atempo={factor:.3f}", "-ar", str(sample_rate), str(temp_out)],
            text=True, capture_output=True, check=False,
        )
        if result.returncode != 0:
            fail(f"{scene_id}/{unit_id}: ffmpeg atempo failed: {result.stderr[-2000:]}")
        stretched, stretched_sr = ta.load(str(temp_out))
        if int(stretched_sr) != int(sample_rate):
            fail(f"{scene_id}/{unit_id}: atempo sample-rate mismatch")
        return stretched
    finally:
        for p in (temp_in, temp_out):
            try:
                p.unlink()
            except Exception:
                pass

def _atempo_chain(factor):
    remaining = max(0.25, min(4.0, float(factor)))
    parts = []
    while remaining > 2.0:
        parts.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        parts.append(0.5)
        remaining /= 0.5
    parts.append(remaining)
    return ",".join(f"atempo={part:.6f}" for part in parts)

def fit_scene_duration(wav, sample_rate, target_s, scene_id):
    try:
        target_s = float(target_s)
    except Exception:
        return wav, False, 1.0
    if target_s <= 0:
        return wav, False, 1.0
    actual_s = wav.shape[-1] / sample_rate
    factor = actual_s / target_s
    if 0.97 <= factor <= 1.03:
        return wav, False, 1.0
    factor = max(0.25, min(4.0, factor))
    temp_in = scene_dir / f".{scene_id}-timing-in.wav"
    temp_out = scene_dir / f".{scene_id}-timing-out.wav"
    try:
        ta.save(str(temp_in), wav.detach().cpu(), sample_rate)
        result = subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(temp_in),
             "-filter:a", _atempo_chain(factor), "-ar", str(sample_rate), str(temp_out)],
            text=True, capture_output=True, check=False,
        )
        if result.returncode != 0:
            fail(f"{scene_id}: scene timing-lock atempo failed: {result.stderr[-2000:]}")
        stretched, stretched_sr = ta.load(str(temp_out))
        if int(stretched_sr) != int(sample_rate):
            fail(f"{scene_id}: timing-lock sample-rate mismatch")
        return stretched, True, factor
    finally:
        for p in (temp_in, temp_out):
            try:
                p.unlink()
            except Exception:
                pass

def generate_prosody_scene(model, item, np, torch, sample_rate):
    units = item.get("prosody_units") or []
    if not units:
        set_seed(item["native"]["seed"], np, torch, device)
        return generate_scene(model, item["text"], item["native"], item["scene_id"]), []
    parts = []
    unit_meta = []
    for index, unit in enumerate(units, start=1):
        tts_text = str(unit.get("tts_text") or "")
        if not tts_text:
            fail(f"{item['scene_id']}: empty prosody unit")
        native = dict(item["native"])
        mapped = unit.get("chatterbox_native") or {}
        for key in ("exaggeration", "temperature", "cfg_weight"):
            if key in mapped:
                native[key] = float(mapped[key])
        native["seed"] = int(item["native"]["seed"]) + index - 1
        set_seed(native["seed"], np, torch, device)
        before_ms = max(0, int(unit.get("pause_before_ms") or 0))
        after_ms = max(0, int(unit.get("pause_after_ms") or 0))
        if before_ms:
            parts.append(torch.zeros((1, round(sample_rate * before_ms / 1000)), dtype=torch.float32))
        wav = generate_scene(model, tts_text, native, f"{item['scene_id']}/{unit.get('id') or index}")
        wav = wav.detach().cpu()
        if wav.ndim == 1:
            wav = wav.unsqueeze(0)
        factor = max(0.85, min(1.15, float(unit.get("ffmpeg_atempo") or 1.0)))
        wav = atempo_waveform(wav, sample_rate, factor, item["scene_id"], str(unit.get("id") or index))
        parts.append(wav)
        if after_ms:
            parts.append(torch.zeros((wav.shape[0], round(sample_rate * after_ms / 1000)), dtype=wav.dtype))
        unit_meta.append({
            "id": unit.get("id"),
            "tts_text": tts_text,
            "source_start": unit.get("source_start"),
            "source_end": unit.get("source_end"),
            "pause_before_ms": before_ms,
            "pause_after_ms": after_ms,
            "relative_speed_pct": unit.get("relative_speed_pct", 100),
            "ffmpeg_atempo": factor,
            "emphasis": unit.get("emphasis"),
            "intent": unit.get("intent"),
            "chatterbox_native_used": native,
        })
        clear_cuda_cache()
    if not parts:
        fail(f"{item['scene_id']}: prosody plan produced no audio")
    channels = max(part.shape[0] for part in parts)
    normalized = [part if part.shape[0] == channels else part.repeat(channels, 1) for part in parts]
    return torch.cat(normalized, dim=-1), unit_meta

needs_generation = any(item["cache"] is None for item in descriptors)
model = None
sample_rate = None

def ensure_perth_watermarker():
    try:
        import perth
    except Exception as exc:
        fail(f"Perth dependency unavailable: {exc}")

    watermarker = getattr(perth, "PerthImplicitWatermarker", None)
    if callable(watermarker):
        return

    if os.getenv("HIBOU_PERTH_REPAIR_ATTEMPTED") == "1":
        fail(
            "PerthImplicitWatermarker is still unavailable after automatic setuptools repair"
        )

    print(
        "HIBOU_PERTH_REPAIR_START reason=PerthImplicitWatermarker_not_callable target=setuptools<81",
        file=sys.stderr,
        flush=True,
    )

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
            "--upgrade",
            "setuptools<81",
        ],
        text=True,
        capture_output=True,
        check=False,
    )

    if result.stdout:
        print(result.stdout[-5000:], file=sys.stderr, flush=True)
    if result.stderr:
        print(result.stderr[-5000:], file=sys.stderr, flush=True)

    if result.returncode != 0:
        fail(
            f"Automatic Perth repair failed while installing setuptools<81 (exit={result.returncode})"
        )

    env = os.environ.copy()
    env["HIBOU_PERTH_REPAIR_ATTEMPTED"] = "1"
    print(
        "HIBOU_PERTH_REPAIR_RESTART",
        file=sys.stderr,
        flush=True,
    )
    restart = subprocess.run(
        [sys.executable, *sys.argv],
        env=env,
        check=False,
    )
    raise SystemExit(restart.returncode)

if needs_generation:
    ensure_perth_watermarker()
    try:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    except Exception as exc:
        fail(f"Chatterbox dependency unavailable: {exc}")
    if device.startswith("cuda") and not torch.cuda.is_available():
        fail("CUDA requested but unavailable; no silent CPU/cloud fallback")
    clear_cuda_cache()
    signature = inspect.signature(ChatterboxMultilingualTTS.from_pretrained)
    load_kwargs = {"device": device}
    if "t3_model" in signature.parameters:
        load_kwargs["t3_model"] = model_variant

    try:
        chatterbox_version = importlib.metadata.version("chatterbox-tts")
    except Exception:
        chatterbox_version = "unknown"

    try:
        model = ChatterboxMultilingualTTS.from_pretrained(**load_kwargs)
    except Exception as exc:
        root = f"{type(exc).__name__}: {exc}"
        print(
            f"HIBOU_CHATTERBOX_LOAD_ROOT_CAUSE version={chatterbox_version} device={device} error={root}",
            file=sys.stderr,
            flush=True,
        )
        if re.search(r"trailing characters|Tokenizer\.from_file|grapheme_mtl", str(exc), re.I):
            try:
                from huggingface_hub import hf_hub_download
                print(
                    "HIBOU_CHATTERBOX_TOKENIZER_REPAIR forcing grapheme tokenizer redownload",
                    file=sys.stderr,
                    flush=True,
                )
                hf_hub_download(
                    repo_id="ResembleAI/chatterbox",
                    filename="grapheme_mtl_merged_expanded_v1.json",
                    force_download=True,
                    token=os.getenv("HF_TOKEN"),
                )
                clear_cuda_cache()
                model = ChatterboxMultilingualTTS.from_pretrained(**load_kwargs)
                print(
                    "HIBOU_CHATTERBOX_TOKENIZER_REPAIR_OK",
                    file=sys.stderr,
                    flush=True,
                )
            except Exception as retry_exc:
                retry_root = f"{type(retry_exc).__name__}: {retry_exc}"
                print(
                    f"HIBOU_CHATTERBOX_TOKENIZER_REPAIR_FAILED error={retry_root}",
                    file=sys.stderr,
                    flush=True,
                )
                fail(
                    f"Chatterbox model load failed on {device}; tokenizer repair retry failed: {retry_exc}"
                )
        else:
            fail(f"Chatterbox model load failed on {device}: {exc}")
    if audio_prompt:
        model.prepare_conditionals(audio_prompt, exaggeration=default_exaggeration)
    sample_rate = int(model.sr)
    model_variant_native = "t3_model" in signature.parameters
    for item in descriptors:
        item["native"]["model_variant_native"] = model_variant if model_variant_native else None

master_parts = []
scene_meta = []
cursor_samples = 0
cache_hits = 0
cache_misses = 0

for item in descriptors:
    scene = item["scene"]
    scene_id = item["scene_id"]
    prosody_units_used = []
    duration_retry_applied = False
    duration_retry_seed_offset = 0
    if item["cache"] is not None:
        wav, cached_sr = ta.load(str(item["scene_path"]))
        cached_sr = int(cached_sr)
        if sample_rate is None:
            sample_rate = cached_sr
        if cached_sr != sample_rate:
            fail(f"{scene_id}: cached sample rate mismatch")
        cache_hits += 1
        cache_state = "hit"
        prosody_units_used = list(item["cache"].get("prosody_units_used") or [])
        duration_retry_applied = bool(item["cache"].get("duration_retry_applied"))
        duration_retry_seed_offset = int(item["cache"].get("duration_retry_seed_offset") or 0)
    else:
        native = item["native"]
        wav, prosody_units_used = generate_prosody_scene(model, item, np, torch, sample_rate)
        wav = wav.detach().cpu()
        clear_cuda_cache()
        if wav.ndim == 1:
            wav = wav.unsqueeze(0)
        if wav.ndim != 2:
            fail(f"{scene_id}: unexpected waveform shape {tuple(wav.shape)}")

        first_duration_s = wav.shape[-1] / sample_rate
        if not duration_is_plausible(first_duration_s, item["duration_bounds"]):
            duration_retry_applied = True
            duration_retry_seed_offset = 100000
            retry_item = copy.deepcopy(item)
            retry_item["native"] = dict(item["native"])
            retry_item["native"]["seed"] = int(item["native"]["seed"]) + duration_retry_seed_offset
            print(
                f"HIBOU_VOICE_DURATION_RETRY scene={scene_id} first_duration_s={first_duration_s:.3f} "
                f"expected_s={item['duration_bounds']['expected_duration_s']:.3f} "
                f"max_s={item['duration_bounds']['max_duration_s']:.3f}",
                file=sys.stderr,
                flush=True,
            )
            wav, prosody_units_used = generate_prosody_scene(model, retry_item, np, torch, sample_rate)
            wav = wav.detach().cpu()
            clear_cuda_cache()
            if wav.ndim == 1:
                wav = wav.unsqueeze(0)
            if wav.ndim != 2:
                fail(f"{scene_id}: unexpected retry waveform shape {tuple(wav.shape)}")

        final_duration_s = wav.shape[-1] / sample_rate
        if not duration_is_plausible(final_duration_s, item["duration_bounds"]):
            fail(
                f"{scene_id}: voice duration remained implausible after one deterministic retry "
                f"(duration={final_duration_s:.3f}s expected={item['duration_bounds']['expected_duration_s']:.3f}s "
                f"allowed={item['duration_bounds']['min_duration_s']:.3f}..{item['duration_bounds']['max_duration_s']:.3f}s)"
            )

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
            "voice_duration_s": final_duration_s,
            "duration_bounds": item["duration_bounds"],
            "duration_retry_applied": duration_retry_applied,
            "duration_retry_seed_offset": duration_retry_seed_offset,
            "prosody_units_used": prosody_units_used,
        }
        item["manifest_path"].write_text(json.dumps(scene_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        cache_misses += 1
        cache_state = "miss"

    pause_ms = int((scene.get("voice") or {}).get("pause_after_ms", 0))
    planned_scene_s = float(scene.get("planned_duration_s") or 0)
    target_voice_s = max(0.35, planned_scene_s - (pause_ms / 1000.0)) if planned_scene_s > 0 else 0
    prelock_duration_s = wav.shape[-1] / sample_rate
    wav, timing_lock_applied, timing_lock_factor = fit_scene_duration(
        wav, sample_rate, target_voice_s, scene_id
    )
    final_duration_s = wav.shape[-1] / sample_rate
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
        "voice_duration_s": final_duration_s,
        "duration_bounds": item["duration_bounds"],
        "duration_retry_applied": duration_retry_applied,
        "duration_retry_seed_offset": duration_retry_seed_offset,
        "prosody_units_used": prosody_units_used,
        "timing_lock": {
            "applied": timing_lock_applied,
            "planned_scene_s": planned_scene_s,
            "target_voice_s": target_voice_s,
            "source_duration_s": prelock_duration_s,
            "final_duration_s": final_duration_s,
            "atempo_factor": timing_lock_factor,
            "pitch_preserved": True,
        },
    }
    item["manifest_path"].write_text(
        json.dumps(scene_manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

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
        "duration_bounds": item["duration_bounds"],
        "duration_retry_applied": duration_retry_applied,
        "duration_retry_seed_offset": duration_retry_seed_offset,
        "pause_after_ms": pause_ms,
        "span_start_s": start_samples / sample_rate,
        "span_end_s": end_samples / sample_rate,
        "span_duration_s": (end_samples - start_samples) / sample_rate,
        "native": item["native"],
        "prosody_plan_schema": ((scene.get("voice") or {}).get("prosody_plan") or {}).get("schema"),
        "prosody_units_used": prosody_units_used,
        "verbatim_preserved": True,
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
    **(contract.get("audio") or {}),
    "state": "ready",
    "engine": "chatterbox_multilingual",
    "reference": "voice-master.wav",
    "sha256": master_hash,
    "sample_rate": sample_rate,
    "device": device,
    "model_variant": model_variant,
    "paid_fallback": False,
    "voice_profile_id": voice_profile_id,
    "voice_profile_text": voice_profile_text,
    "voice_profile_runtime": {
        "profile_id": voice_profile_id,
        "profile_text_present": bool(voice_profile_text),
        "audio_reference_present": bool(audio_prompt),
        "baseline_controls": {
            "exaggeration": default_exaggeration,
            "temperature": default_temperature,
            "cfg_weight": default_cfg_weight,
        },
        "scene_prosody_overrides_supported": True,
    },
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
    "schema": "HIBOU_CHATTERBOX_BATCH_V3",
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
    "voice_profile_id": voice_profile_id,
    "voice_profile_text": voice_profile_text,
    "voice_profile_runtime": updated["audio"].get("voice_profile_runtime"),
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
