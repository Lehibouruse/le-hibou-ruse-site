#!/usr/bin/env python3
import json
import random
import sys
from pathlib import Path

def fail(message):
    raise RuntimeError(message)

if len(sys.argv) != 3:
    fail("usage: chatterbox-local.py request.json output.wav")

request_path = Path(sys.argv[1]).resolve()
output_path = Path(sys.argv[2]).resolve()
req = json.loads(request_path.read_text(encoding="utf-8"))

text = str(req.get("text", "")).strip()
if not text or len(text) > 300:
    fail("text must contain 1..300 characters")
if req.get("language_id", "fr") != "fr":
    fail("Hibou wrapper currently accepts language_id=fr only")

exaggeration = float(req.get("exaggeration", 0.5))
temperature = float(req.get("temperature", 0.8))
cfg_weight = float(req.get("cfg_weight", 0.5))
seed = int(req.get("seed", 0))
device = str(req.get("device", "cuda"))
model_variant = str(req.get("model_variant", "v3"))
audio_prompt = req.get("audio_prompt_path")

if not 0.25 <= exaggeration <= 2.0:
    fail("exaggeration out of official UI range")
if not 0.05 <= temperature <= 5.0:
    fail("temperature out of official UI range")
if not 0.0 <= cfg_weight <= 1.0:
    fail("cfg_weight out of supported range")
if audio_prompt and not Path(audio_prompt).expanduser().exists():
    fail("audio_prompt_path missing")

try:
    import numpy as np
    import torch
    import torchaudio as ta
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
except Exception as exc:
    fail(f"Chatterbox dependencies unavailable: {exc}")

if seed:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if device.startswith("cuda") and torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)

if device.startswith("cuda") and not torch.cuda.is_available():
    fail("CUDA requested but unavailable; choose a tested device explicitly rather than silently falling back")

model = ChatterboxMultilingualTTS.from_pretrained(device=device, t3_model=model_variant)
kwargs = {
    "language_id": "fr",
    "exaggeration": exaggeration,
    "temperature": temperature,
    "cfg_weight": cfg_weight,
}
if audio_prompt:
    kwargs["audio_prompt_path"] = str(Path(audio_prompt).expanduser().resolve())

wav = model.generate(text, **kwargs)
output_path.parent.mkdir(parents=True, exist_ok=True)
ta.save(str(output_path), wav, model.sr)

meta = {
    "sample_rate": int(model.sr),
    "language_id": "fr",
    "exaggeration": exaggeration,
    "temperature": temperature,
    "cfg_weight": cfg_weight,
    "seed": seed,
    "device": device,
    "model_variant": model_variant,
    "audio_prompt_path": str(audio_prompt) if audio_prompt else None,
    "prosody_metadata_not_native": req.get("prosody"),
}
output_path.with_suffix(output_path.suffix + ".json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
