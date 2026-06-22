# The live pipeline

`server.py` is a small Python-stdlib HTTP server that exposes two GPU pipelines behind a job API
(the same server that backs the upload tools on the site):

| route | does |
|---|---|
| `POST /api/animate` | model `.glb` + driving video → **ActionMesh M5** → animated `.glb` + GIF |
| `POST /api/rig` | model `.glb` → **SkinTokens / TokenRig** → rigged `.glb` |
| `POST /api/generate` | image → **Hunyuan3D-2** (local) → textured `.glb` |
| `GET /api/job/<id>` | job status `{state, step, done, log, result}` (the front-end polls this) |

It serves the static site from its own folder and shells out to the generators.

## Requirements
An NVIDIA GPU (≈16 GB is enough) plus two upstream projects, set up with their own venvs:

- **ActionMesh** — https://github.com/facebookresearch/actionmesh — the `{video+3D}→4D` generator.
  "M5" = 3 autoregressively-anchored native 24 fps windows + a MORPHOS-style anti-drift pass,
  retimed to ~4 s.
- **SkinTokens / TokenRig** — https://github.com/VAST-AI-Research/SkinTokens — mesh → skeleton +
  per-vertex skin weights (texture & scale preserved via `--use_transfer`).
- **Hunyuan3D-2** (image→3D) — https://github.com/Tencent-Hunyuan/Hunyuan3D-2 — run its own API:
  `python api_server.py --host 0.0.0.0 --port 8080` (~6 GB VRAM shape-only, ~16 GB textured). Our
  server forwards the uploaded image to it.

## What server.py calls
- Animate: `bash A4D/scripts/make_4d.sh TAG VIDEO MESH OUTDIR` → then `to_gif.py` (imageio + Pillow)
  to turn the M5 clip into the looping GIF.
- Rig: `SkinTokens/demo.py --input <in.glb> --output <out.glb> --use_transfer`.
- Generate: POSTs the image (base64) to the Hunyuan3D-2 api_server at `HY3D_API`
  (default `http://127.0.0.1:8080/generate`) and saves the returned GLB.

`server.py` here is the reference glue — point the `A4D` / `SKIN` paths at your own checkouts of the
two projects.

## Notes
- One GPU job at a time (a lock); progress steps are derived by watching the work dir.
- **Windows: use Git Bash, not WSL bash** — WSL maps `C:` → `/mnt/c`, which breaks the script's
  `/c/...` paths.
- **Speed scales with the GPU.** ActionMesh's published H100 figures are **~75 s** (default) /
  **~45 s** (`--fast`) *per window*; M5 chains **3 windows**, so an animate run is only a **few minutes
  on an H100 / B100-class card**. On our 16 GB RTX 5070 Ti it's forced into `--low_ram`, which is what
  makes the same run **~30 min**. A rig run is a few minutes. Keep the server running for the full duration.
