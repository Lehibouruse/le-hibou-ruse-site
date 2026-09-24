#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

if len(sys.argv)<4:
    raise SystemExit("usage: video-dinov2-rank.py reference.jpg candidates.json output.json")
reference=Path(sys.argv[1]).resolve()
candidates=json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
if not isinstance(candidates,list) or not candidates:
    raise RuntimeError("candidates.json must be a non-empty array of image paths")
allow_download=os.getenv("HIBOU_ALLOW_MODEL_DOWNLOAD","0")=="1"
model_id=os.getenv("HIBOU_DINOV2_MODEL","facebook/dinov2-small")
try:
    import torch
    import torch.nn.functional as F
    from PIL import Image
    from transformers import AutoImageProcessor, AutoModel
except Exception as exc:
    raise RuntimeError(f"Optional DINOv2 QC dependencies unavailable: {exc}")

processor=AutoImageProcessor.from_pretrained(model_id,local_files_only=not allow_download)
model=AutoModel.from_pretrained(model_id,local_files_only=not allow_download)
model.eval()
device="cuda" if torch.cuda.is_available() else "cpu"
model.to(device)

def embed(path):
    image=Image.open(path).convert("RGB")
    batch=processor(images=image,return_tensors="pt")
    batch={k:v.to(device) for k,v in batch.items()}
    with torch.inference_mode():
        out=model(**batch).last_hidden_state[:,0]
        return F.normalize(out,dim=-1)

ref=embed(reference)
rows=[]
for p in candidates:
    path=Path(p).resolve()
    score=float((ref*embed(path)).sum().item())
    rows.append({"path":str(path),"reference_similarity":score})
rows.sort(key=lambda x:x["reference_similarity"],reverse=True)
result={"schema":"HIBOU_DINOV2_REFERENCE_RANK_V1","model":model_id,"reference":str(reference),"ranking":rows,"decision":"ASSIST_ONLY_HUMAN_SELECTION_REQUIRED","paid_fallback":False,"model_download_allowed":allow_download}
Path(sys.argv[3]).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(result,ensure_ascii=False))
