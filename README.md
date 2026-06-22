# Temporial — demo

**Live:** https://andtay.com/temporial-demo

Turn a single image into living, rigged 3D:

- **Generate** — an image → **Hunyuan3D-2** (local, open source) or **Tencent Cloud** Hunyuan To 3D (BYOK) → a textured `.glb`.
- **Animate** — a model `.glb` + a short driving video → **ActionMesh M5** → an animated `.glb` (rotatable) **and** a looping GIF.
- **Rig** — a model `.glb` → **SkinTokens / TokenRig** → a skinned, animation-ready `.glb`.

## What's static vs live
The page, theme, flower scroll-scrub background, the **gallery** (GIF + rotatable 3D + a live
Three.js **skeleton** showcase), and the instant **animate samples** are fully static — they work on
GitHub Pages as-is. The skeleton viewer (`rig-viewer.js`) renders a rigged `.glb`'s bones in-browser
with Three.js — no Blender needed.

The three **upload** tools (generate, animate, rig) run real pipelines that need a backend; on the
hosted site they show a *"runs locally"* state with a link back here. Generate also offers a **cloud
BYOK** option (Tencent Cloud Hunyuan To 3D) that needs no GPU — your keys are sent only to your own
local server to sign the request. To run any of it yourself, see [`pipeline/PIPELINE.md`](pipeline/PIPELINE.md).

## Run the static site locally
```bash
python -m http.server 8000      # then open http://localhost:8000
```

## Run the full live demo (with the generators)
Needs an NVIDIA GPU plus the ActionMesh and SkinTokens environments — see
[`pipeline/PIPELINE.md`](pipeline/PIPELINE.md).

## Layout
```
index.html  styles.css  app.js        # the site (Temporial theme, model-viewer 3D)
rig-viewer.js                         # Three.js skeleton viewer (mesh + bones)
vendor/model-viewer.min.js            # Google <model-viewer>
vendor/three/                         # bundled three.js + GLTFLoader/OrbitControls
assets/                               # brand mark, flower_video.mp4 (scroll-scrub)
samples/*.gif                         # gallery GIFs
models/*.glb                          # animated (M5) + rigged (cat_rigged.glb) samples
pipeline/                             # server.py + to_gif.py + how to run the live pipeline
```

## Built on
[ActionMesh](https://github.com/facebookresearch/actionmesh) ·
[SkinTokens / TokenRig](https://github.com/VAST-AI-Research/SkinTokens) ·
[TripoSG](https://github.com/VAST-AI-Research/TripoSG) ·
[model-viewer](https://github.com/google/model-viewer).
