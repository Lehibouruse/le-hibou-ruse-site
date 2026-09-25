#!/usr/bin/env python3
import json, math, sys
from pathlib import Path

try:
    import cv2
    import numpy as np
except Exception as exc:
    raise RuntimeError("OpenCV QC dependencies missing. Install opencv-python-headless and numpy in the local video environment.") from exc

def phash(gray):
    resized=cv2.resize(gray,(32,32),interpolation=cv2.INTER_AREA).astype(np.float32)
    dct=cv2.dct(resized)[:8,:8]
    vals=dct.flatten()[1:]
    med=float(np.median(vals))
    bits=(vals>med).astype(np.uint8)
    return "".join("1" if b else "0" for b in bits)

def hamming(a,b):
    return sum(x!=y for x,y in zip(a,b)) if a and b and len(a)==len(b) else None

def analyze(path):
    img=cv2.imread(str(path),cv2.IMREAD_COLOR)
    if img is None:
        return {"path":str(path),"decode":False,"status":"REJECT","reasons":["decode_failed"]}
    h,w=img.shape[:2]
    gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    hsv=cv2.cvtColor(img,cv2.COLOR_BGR2HSV)
    brightness=float(gray.mean())/255.0
    dark=float((gray<12).mean())
    bright=float((gray>243).mean())
    sharp=float(cv2.Laplacian(gray,cv2.CV_64F).var())
    saturation=float(hsv[:,:,1].mean())/255.0
    return {
        "path":str(path),"decode":True,"width":int(w),"height":int(h),
        "aspect_ratio":float(w/h),"brightness":brightness,
        "dark_clip_ratio":dark,"bright_clip_ratio":bright,
        "sharpness_laplacian_var":sharp,"mean_saturation":saturation,
        "phash":phash(gray)
    }

def main():
    if len(sys.argv)<3:
        raise SystemExit("usage: video-image-perceptual-qc.py image-qc-input.json output.json [reference.jpg]")
    src=Path(sys.argv[1]).resolve()
    out=Path(sys.argv[2]).resolve()
    ref=Path(sys.argv[3]).resolve() if len(sys.argv)>3 else None
    data=json.loads(src.read_text(encoding="utf-8"))
    rows=data.get("rows") if isinstance(data,dict) else None
    if not isinstance(rows,list) or not rows:
        raise RuntimeError("input must contain technical QC rows")
    reference=analyze(ref) if ref else None
    seen=[]
    result=[]
    for row in rows:
        base=dict(row)
        p=Path(str(row.get("path",""))).resolve()
        metrics=analyze(p)
        reasons=[]
        if not metrics.get("decode"):
            reasons.append("decode_failed")
        else:
            if metrics["brightness"] < 0.10: reasons.append("too_dark")
            if metrics["brightness"] > 0.92: reasons.append("too_bright")
            if metrics["dark_clip_ratio"] > 0.30: reasons.append("dark_clipping")
            if metrics["bright_clip_ratio"] > 0.30: reasons.append("bright_clipping")
            if metrics["sharpness_laplacian_var"] < 35.0: reasons.append("low_sharpness")
            duplicate_near=None
            for prev in seen:
                dist=hamming(metrics["phash"],prev["phash"])
                if dist is not None and dist <= 4:
                    duplicate_near=prev["candidate_id"]; reasons.append("near_duplicate_phash"); break
            seen.append({"candidate_id":row.get("candidate_id"),"phash":metrics["phash"]})
            if reference and reference.get("decode"):
                metrics["reference_phash_distance"]=hamming(metrics["phash"],reference.get("phash"))
        technical_ok=row.get("status")=="PASS"
        if not technical_ok: reasons.append("technical_qc_reject")
        status="PASS" if technical_ok and not reasons else "REJECT"
        score=100
        penalties={"too_dark":25,"too_bright":25,"dark_clipping":20,"bright_clipping":20,"low_sharpness":25,"near_duplicate_phash":30,"technical_qc_reject":60,"decode_failed":100}
        for reason in reasons: score-=penalties.get(reason,10)
        result.append({**base,"perceptual":metrics,"reasons":sorted(set(reasons)),"perceptual_score":max(0,score),"status":status})
    by_scene={}
    for row in result:
        by_scene.setdefault(row.get("scene_id"),[]).append(row)
    scene_summary={}
    for scene,items in by_scene.items():
        ranked=sorted(items,key=lambda x:(x["status"]!="PASS",-x["perceptual_score"],x.get("candidate",999)))
        passes=[x for x in ranked if x["status"]=="PASS"]
        scene_summary[scene]={
            "pass":len(passes),"reject":len(items)-len(passes),"total":len(items),
            "selected_candidate_id":passes[0].get("candidate_id") if passes else None,
            "needs_regeneration":len(passes)==0
        }
    payload={
        "schema":"HIBOU_IMAGE_PERCEPTUAL_QC_V1",
        "source":str(src),
        "reference":str(ref) if ref else None,
        "rows":result,
        "scene_summary":scene_summary,
        "all_scenes_have_candidate":all(not x["needs_regeneration"] for x in scene_summary.values()),
        "thresholds":{"brightness_min":0.10,"brightness_max":0.92,"clip_max":0.30,"sharpness_min":35.0,"phash_duplicate_distance_max":4},
        "policy":{"local_only":True,"paid_fallback":False,"human_review_before_full_pilot":True}
    }
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"ok":True,"scenes":len(scene_summary),"all_scenes_have_candidate":payload["all_scenes_have_candidate"]}))
if __name__=="__main__":
    main()
