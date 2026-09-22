#!/usr/bin/env python3
"""Deterministic local renderer for VIDEO_CONTRACT_V1.
No cloud call, no model download, no secret. Heavy media stays outside Vercel.
"""
import argparse, hashlib, json, subprocess, tempfile
from pathlib import Path

REQUIRED_SCENE={"scene_id","order","narration_exact","visual_idea","planned_duration_s","selected_image","image_params","audio_ref","qc"}

def fail(msg): raise SystemExit(msg)
def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()
def duration(path):
    p=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",str(path)],capture_output=True,text=True,check=True)
    return float(p.stdout.strip())

def validate(c,root):
    if c.get("contract_version")!="VIDEO_CONTRACT_V1": fail("unsupported contract_version")
    out=c.get("output") or {}
    for key in ("width","height","fps","video_codec","audio_codec","pixel_format","container"):
        if key not in out: fail(f"output.{key} missing")
    scenes=c.get("scenes") or []
    if not scenes: fail("scenes missing")
    orders=[]
    for s in scenes:
        missing=REQUIRED_SCENE-set(s)
        if missing: fail(f"{s.get('scene_id','?')}: missing {sorted(missing)}")
        orders.append(s["order"])
        image=root/s["selected_image"]
        if not image.is_file(): fail(f"missing image: {image}")
        narration=s["narration_exact"]
        if narration.get("mode")=="locked_audio_slice":
            audio=root/narration["audio_ref"]
            if not audio.is_file(): fail(f"missing locked audio: {audio}")
            if narration.get("end_s",0)<=narration.get("start_s",0): fail("invalid audio slice")
        elif not str(narration.get("text") or "").strip():
            fail("narration_exact requires text or locked audio slice")
        if float(s["planned_duration_s"])<=0: fail("scene duration must be >0")
    if orders!=list(range(1,len(scenes)+1)): fail(f"scene orders must be contiguous, got {orders}")
    voice=c.get("voice") or {}
    audio=root/voice.get("reference_audio","")
    if not audio.is_file(): fail(f"voice reference_audio missing: {audio}")
    if voice.get("reference_audio_sha256") and sha256(audio)!=voice["reference_audio_sha256"]:
        fail("voice audio sha256 mismatch")
    return scenes,audio

def render(contract_path,output_path):
    contract_path=Path(contract_path).resolve(); root=contract_path.parent
    c=json.loads(contract_path.read_text(encoding="utf-8"))
    scenes,audio=validate(c,root); cfg=c["output"]
    width,height,fps=int(cfg["width"]),int(cfg["height"]),int(cfg["fps"])
    total=sum(float(s["planned_duration_s"]) for s in scenes)
    output_path=Path(output_path).resolve(); output_path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="hibou-render-") as temp:
        temp=Path(temp); parts=[]
        for idx,s in enumerate(scenes,1):
            seconds=float(s["planned_duration_s"]); frames=max(1,round(seconds*fps))
            image=(root/s["selected_image"]).resolve(); part=temp/f"scene-{idx:03}.mp4"
            p=s.get("image_params",{}); z0=float(p.get("zoom_start",1)); z1=float(p.get("zoom_end",1.03))
            inc=max(0,(z1-z0)/max(frames-1,1))
            vf=(f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},"
                f"zoompan=z='min({z1:.6f},max({z0:.6f},zoom+{inc:.9f}))':d={frames}:s={width}x{height}:fps={fps},"
                f"format={cfg['pixel_format']}")
            subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-loop","1","-i",str(image),"-vf",vf,"-frames:v",str(frames),"-an","-c:v",cfg["video_codec"],"-preset","medium","-crf","18","-r",str(fps),"-pix_fmt",cfg["pixel_format"],"-map_metadata","-1",str(part)],check=True)
            parts.append(part)
        concat=temp/"concat.txt"; concat.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
        video=temp/"video.mp4"
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",str(concat),"-c","copy","-map_metadata","-1",str(video)],check=True)
        subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",str(video),"-i",str(audio),"-t",f"{total:.6f}","-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a",cfg["audio_codec"],"-b:a","192k","-ar","44100","-ac","2","-movflags","+faststart","-map_metadata","-1","-metadata","creation_time=",str(output_path)],check=True)
    measured=duration(output_path)
    if abs(measured-total)>1/fps+0.05: fail(f"duration mismatch expected={total:.3f} measured={measured:.3f}")
    return {"output":str(output_path),"sha256":sha256(output_path),"planned_duration_s":total,"measured_duration_s":measured,"scenes":len(scenes),"fps":fps,"width":width,"height":height}

if __name__=="__main__":
    ap=argparse.ArgumentParser(); ap.add_argument("contract"); ap.add_argument("output"); args=ap.parse_args()
    print(json.dumps(render(args.contract,args.output),ensure_ascii=False,indent=2))
