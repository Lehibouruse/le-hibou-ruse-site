#!/usr/bin/env python3
import json, os, re, subprocess, sys, tempfile
from pathlib import Path

def norm(s):
    s=s.lower().replace("’","'").replace("…"," ")
    s=re.sub(r"[^a-zàâçéèêëîïôûùüÿñæœ0-9' ]+"," ",s)
    return re.sub(r"\s+"," ",s).strip()

def levenshtein(a,b):
    prev=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        cur=[i]
        for j,y in enumerate(b,1):
            cur.append(min(cur[-1]+1,prev[j]+1,prev[j-1]+(x!=y)))
        prev=cur
    return prev[-1]

if len(sys.argv)<3:
    raise SystemExit("usage: video-whisper-qc.py audio_file exact_text_file_or_json [output.json]")
audio=Path(sys.argv[1]).resolve()
source=Path(sys.argv[2]).resolve()
if source.suffix.lower()==".json":
    data=json.loads(source.read_text(encoding="utf-8"))
    expected=" ".join((s.get("narration_text") or (s.get("narration_exact") or {}).get("text") or "") for s in data.get("scenes",[]))
else:
    expected=source.read_text(encoding="utf-8")
expected_n=norm(expected)
if not expected_n:
    raise RuntimeError("expected transcript empty")

exe=os.environ.get("HIBOU_WHISPER_BIN","whisper")
model=os.environ.get("HIBOU_WHISPER_MODEL","small")
with tempfile.TemporaryDirectory(prefix="hibou-whisper-") as tmp:
    cmd=[exe,str(audio),"--language","French","--model",model,"--output_format","json","--output_dir",tmp,"--verbose","False"]
    r=subprocess.run(cmd,text=True,capture_output=True)
    if r.returncode!=0:
        raise RuntimeError("Whisper unavailable/failed; install locally only if this optional QC is desired: "+(r.stderr[-2000:] or r.stdout[-2000:]))
    out=Path(tmp)/(audio.stem+".json")
    data=json.loads(out.read_text(encoding="utf-8"))
    got=data.get("text","")
got_n=norm(got)
ew=expected_n.split(); gw=got_n.split()
dist=levenshtein(ew,gw); wer=dist/max(1,len(ew))
result={"schema":"HIBOU_WHISPER_VERBATIM_QC_V1","audio":str(audio),"model":model,"expected":expected,"transcribed":got,"wer":wer,"pass":wer<=float(os.environ.get("HIBOU_MAX_WER","0.08")),"paid_fallback":False}
if len(sys.argv)>3: Path(sys.argv[3]).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(result,ensure_ascii=False))
