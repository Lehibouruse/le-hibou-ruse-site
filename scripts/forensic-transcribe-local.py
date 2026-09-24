#!/usr/bin/env python3
import json, sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("usage: forensic-transcribe-local.py audio.wav output.json")

audio=Path(sys.argv[1]).resolve()
out=Path(sys.argv[2]).resolve()

try:
    from faster_whisper import WhisperModel
except Exception as exc:
    raise SystemExit("faster-whisper indisponible localement: "+str(exc))

model_name = __import__("os").environ.get("HIBOU_FORENSIC_WHISPER_MODEL","small")
device = __import__("os").environ.get("HIBOU_FORENSIC_WHISPER_DEVICE","cuda")
compute = __import__("os").environ.get("HIBOU_FORENSIC_WHISPER_COMPUTE","float16" if device=="cuda" else "int8")
model=WhisperModel(model_name,device=device,compute_type=compute)
segments,info=model.transcribe(str(audio),language="fr",beam_size=5,vad_filter=True,condition_on_previous_text=True)
rows=[]
for seg in segments:
    txt=(seg.text or "").strip()
    if txt:
        rows.append({"start":round(seg.start,3),"end":round(seg.end,3),"text":txt})
payload={
    "schema":"HIBOU_FORENSIC_TRANSCRIPT_V1",
    "status":"ok",
    "model":model_name,
    "device":device,
    "compute_type":compute,
    "language":info.language,
    "language_probability":info.language_probability,
    "segments":rows,
    "text":" ".join(x["text"] for x in rows),
    "paid_fallback":False,
    "network_used":False,
}
out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"ok":True,"segments":len(rows),"output":str(out)},ensure_ascii=False))
