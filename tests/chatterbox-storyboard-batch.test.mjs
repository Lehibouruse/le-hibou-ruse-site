import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("batch Chatterbox storyboard wrapper is syntaxically valid without loading model",()=>{
 const command=process.platform==="win32"?"py":"python3";
 const script="import ast,pathlib; ast.parse(pathlib.Path('scripts/chatterbox-storyboard-batch.py').read_text(encoding='utf-8'))";
 const args=process.platform==="win32"?["-3.11","-B","-c",script]:["-B","-c",script];
 const r=spawnSync(command,args,{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr||r.stdout);
});
test("voice batch has per-scene cache and no silent paid fallback",()=>{
 const source=readFileSync(new URL("../scripts/chatterbox-storyboard-batch.py",import.meta.url),"utf8");
 assert.match(source,/HIBOU_CHATTERBOX_SCENE_CACHE_V1/);
 assert.match(source,/fingerprint/);
 assert.match(source,/scene_cache_hits/);
 assert.match(source,/scene_cache_misses/);
 assert.match(source,/no silent CPU\/cloud fallback/);
 assert.match(source,/"paid_fallback": False/);
});

test("identity lock still applies bounded phrase prosody to supported Chatterbox controls",()=>{
 const source=readFileSync(new URL("../scripts/chatterbox-storyboard-batch.py",import.meta.url),"utf8");
 assert.match(source,/native = apply_prosody_native_controls\(item\["native"\], mapped, voice_identity_lock\)/);
 const command=process.platform==="win32"?"py":"python3";
 const prefix=process.platform==="win32"?["-3.11"]:[];
 const probe=`import ast, math, pathlib
source = pathlib.Path("scripts/chatterbox-storyboard-batch.py").read_text(encoding="utf-8")
tree = ast.parse(source)
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "apply_prosody_native_controls")
scope = {"math": math, "fail": lambda message: (_ for _ in ()).throw(RuntimeError(message))}
exec(compile(ast.Module(body=[function], type_ignores=[]), "<native-policy>", "exec"), scope)
apply = scope["apply_prosody_native_controls"]
base = {"exaggeration": 0.5, "temperature": 0.65, "cfg_weight": 0.5, "seed": 42000, "audio_prompt_path": "approved.wav"}
mapped = {"exaggeration": 0.72, "temperature": 0.86, "cfg_weight": 0.58}
locked = apply(base, mapped, True)
assert locked["exaggeration"] == 0.72 and locked["temperature"] == 0.86 and locked["cfg_weight"] == 0.58
assert locked["seed"] == 42000 and locked["audio_prompt_path"] == "approved.wav"
bounded = apply(base, {"exaggeration": 1.5, "temperature": 1.5, "cfg_weight": 0.9}, True)
assert bounded["exaggeration"] == 0.75 and bounded["temperature"] == 0.9 and bounded["cfg_weight"] == 0.65
unlocked = apply(base, {"exaggeration": 1.5}, False)
assert unlocked["exaggeration"] == 1.5
try:
    apply(base, {"temperature": float("nan")}, True)
    raise AssertionError("NaN accepted")
except RuntimeError:
    pass
`;
 const r=spawnSync(command,[...prefix,"-c",probe],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr||r.stdout);
});
