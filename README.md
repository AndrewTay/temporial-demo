# Temporial — demo

**Live:** https://andtay.com/temporial-demo

Turn an image-born 3D model into living, rigged 3D:

- **Animate** — a model `.glb` + a short driving video → **ActionMesh M5** → an animated `.glb` (rotatable) **and** a looping GIF.
- **Rig** — a model `.glb` → **SkinTokens / TokenRig** → a skinned, animation-ready `.glb`.

## What's static vs live
The page, theme, flower scroll-scrub background, the **gallery** (GIF + rotatable 3D + a live
Three.js **skeleton** showcase), and the instant **animate samples** are fully static — they work on
GitHub Pages as-is. The skeleton viewer (`rig-viewer.js`) renders a rigged `.glb`'s bones in-browser
with Three.js — no Blender needed.

The two **upload** tools run the real GPU pipelines, which need a backend; on the hosted site they
show a *"runs locally"* state with a link back here. To run the live generators yourself, see
[`pipeline/PIPELINE.md`](pipeline/PIPELINE.md).

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
