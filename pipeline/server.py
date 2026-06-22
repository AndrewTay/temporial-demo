"""
Temporial — live demo backend.

Two real pipelines, served behind a tiny async job API:
  POST /api/animate  (multipart: model + video)  -> ActionMesh M5  -> animated .glb + .gif
  POST /api/rig      (multipart: model | json {sample})  -> SkinTokens -> rigged .glb
  GET  /api/job/<id> -> {state, step, done[], log, result, error}

Static site is served from this folder; /lib/* exposes A4D/asset (the seeded gallery
results); /jobs/* exposes per-job outputs.  Heavy GPU work is serialized by a lock.

Run with the A4D venv python (stdlib only here; the venvs are used by the subprocesses):
  A4D/.venv/Scripts/python.exe site/server.py
Then open http://127.0.0.1:8770
"""
import http.server, socketserver, json, os, sys, uuid, subprocess, threading, time, shutil, struct

ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # Ani3D/
SITE  = os.path.join(ROOT, "site")
A4D   = os.path.join(ROOT, "A4D")
SKIN  = os.path.join(ROOT, "SkinTokens")
JOBS  = os.path.join(SITE, "jobs")
LIB   = os.path.join(A4D, "asset")
A4D_PY  = os.path.join(A4D, ".venv", "Scripts", "python.exe")
SKIN_PY = os.path.join(SKIN, ".venv", "Scripts", "python.exe")
MAKE4D  = os.path.join(A4D, "scripts", "make_4d.sh")
TOGIF   = os.path.join(SITE, "to_gif.py")
WORKROOT = os.path.join(A4D, "outputs", "_work")
PORT = 8770
os.makedirs(JOBS, exist_ok=True)

RIG_SAMPLES = {
    "cat-mesh": os.path.join(LIB, "cat", "inputs", "cat_50k_3d.glb"),
    "pug-mesh": os.path.join(LIB, "pug", "inputs", "PugCartoon3D.glb"),
}

CT = {".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".gif": "image/gif",
      ".mp4": "video/mp4", ".js": "text/javascript", ".css": "text/css",
      ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
      ".json": "application/json"}

JOBSTATE = {}                 # id -> dict
GPU_LOCK = threading.Lock()   # one heavy job on the GPU at a time


def find_bash():
    """Force Git-Bash. WSL bash (System32) maps C: to /mnt/c, breaking our /c/... paths."""
    for c in (r"C:\Program Files\Git\bin\bash.exe",
              r"C:\Program Files\Git\usr\bin\bash.exe",
              r"C:\Program Files (x86)\Git\bin\bash.exe"):
        if os.path.exists(c):
            return c
    w = shutil.which("bash")
    if w and "system32" not in w.lower() and "windowsapps" not in w.lower():
        return w
    return r"C:\Program Files\Git\bin\bash.exe"
BASH = find_bash()


def msys(p):
    """Windows path -> Git-Bash/msys path (C:\\a\\b -> /c/a/b)."""
    p = os.path.abspath(p)
    drive, rest = os.path.splitdrive(p)
    return "/" + drive[0].lower() + rest.replace("\\", "/")


def glb_bone_count(path):
    """Read the GLB JSON chunk and return len(skins[0].joints), or None."""
    try:
        with open(path, "rb") as f:
            magic, _ver, _len = struct.unpack("<III", f.read(12))
            if magic != 0x46546C67:
                return None
            clen, ctype = struct.unpack("<II", f.read(8))
            if ctype != 0x4E4F534A:                # 'JSON'
                return None
            gltf = json.loads(f.read(clen).decode("utf-8"))
        skins = gltf.get("skins") or []
        if skins:
            return max(len(s.get("joints", [])) for s in skins)
    except Exception:
        pass
    return None


def parse_multipart(body, boundary):
    out = {}
    for part in body.split(b"--" + boundary):
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part in (b"", b"--", b"--\r\n") or b"\r\n\r\n" not in part:
            continue
        head, data = part.split(b"\r\n\r\n", 1)
        if data.endswith(b"\r\n"):
            data = data[:-2]
        name = filename = None
        for line in head.decode("utf-8", "replace").split("\r\n"):
            if line.lower().startswith("content-disposition"):
                for seg in line.split(";"):
                    seg = seg.strip()
                    if seg.startswith("name="):
                        name = seg[5:].strip('"')
                    elif seg.startswith("filename="):
                        filename = seg[9:].strip('"')
        if name:
            out[name] = {"filename": filename, "data": data}
    return out


def stream_proc(job, cmd, cwd, step_fn):
    """Run cmd, stream stdout->job log, call step_fn(job) periodically. Return exit code."""
    lines = job["_log"]
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, errors="replace", bufsize=1)

    def reader():
        for ln in proc.stdout:
            lines.append(ln.rstrip("\n"))
            if len(lines) > 600:
                del lines[:200]
    t = threading.Thread(target=reader, daemon=True); t.start()
    while proc.poll() is None:
        step_fn(job)
        time.sleep(0.8)
    t.join(timeout=2)
    step_fn(job)
    return proc.returncode


def set_steps(job, done, step):
    job["done"], job["step"] = done, step


# ---------------- workers ----------------
def run_animate(job, model_path, video_path):
    jid = job["id"]; tag = "job" + jid
    jobdir = os.path.join(JOBS, jid)
    work = os.path.join(WORKROOT, tag)
    job["state"] = "queued"; set_steps(job, ["upload"], None)
    with GPU_LOCK:
        job["state"] = "running"; set_steps(job, ["upload", "seg"], "w1")

        def steps(j):
            done = ["upload", "seg"]; cur = "w1"
            if os.path.exists(os.path.join(work, "n1", "deformations_vertices.npy")):
                done.append("w1"); cur = "w2"
            if os.path.exists(os.path.join(work, "n2", "deformations_vertices.npy")):
                done.append("w2"); cur = "w3"
            if os.path.exists(os.path.join(work, "n3", "deformations_vertices.npy")):
                done.append("w3"); cur = "build"
            set_steps(j, done, cur)

        cmd = [BASH, msys(MAKE4D), tag, msys(video_path), msys(model_path), msys(jobdir)]
        rc = stream_proc(job, cmd, ROOT, steps)

        glb = os.path.join(jobdir, f"{tag}_M5_native_4s.glb")
        mp4 = os.path.join(jobdir, f"{tag}_M5_native.mp4")
        if rc != 0 or not os.path.exists(glb):
            job["state"] = "error"; job["error"] = "4D generation failed"; return
        # GIF deliverable from the M5 clip
        gif = os.path.join(jobdir, "anim.gif")
        try:
            stream_proc(job, [A4D_PY, TOGIF, mp4, gif, "15", "380"], ROOT, lambda j: None)
        except Exception as e:
            job["_log"].append(f"[gif] {e}")
        set_steps(job, ["upload", "seg", "w1", "w2", "w3", "build"], None)
        res = {"model": f"/jobs/{jid}/{tag}_M5_native_4s.glb",
               "mp4": f"/jobs/{jid}/{tag}_M5_native.mp4",
               "stat": "ActionMesh M5 · native chain + anti-drift"}
        if os.path.exists(gif):
            res["gif"] = f"/jobs/{jid}/anim.gif"
        job["result"] = res; job["state"] = "done"


def run_rig(job, model_path):
    jid = job["id"]; jobdir = os.path.join(JOBS, jid)
    out = os.path.join(jobdir, "rigged.glb")
    job["state"] = "queued"; set_steps(job, ["upload"], None)
    with GPU_LOCK:
        job["state"] = "running"; set_steps(job, ["upload"], "rig")

        def steps(j):
            if os.path.exists(out):
                set_steps(j, ["upload", "rig"], "build")
            else:
                set_steps(j, ["upload"], "rig")

        cmd = [SKIN_PY, "demo.py", "--input", model_path, "--output", out, "--use_transfer"]
        rc = stream_proc(job, cmd, SKIN, steps)
        if rc != 0 or not os.path.exists(out):
            job["state"] = "error"; job["error"] = "rigging failed"; return
        set_steps(job, ["upload", "rig", "build"], None)
        res = {"model": f"/jobs/{jid}/rigged.glb"}
        bones = glb_bone_count(out)
        if bones:
            res["bones"] = bones
        job["result"] = res; job["state"] = "done"


def new_job(kind):
    jid = uuid.uuid4().hex[:8]
    JOBSTATE[jid] = {"id": jid, "kind": kind, "state": "queued", "step": None,
                     "done": [], "result": None, "error": None, "_log": [], "t0": time.time()}
    os.makedirs(os.path.join(JOBS, jid), exist_ok=True)
    return JOBSTATE[jid]


def job_public(job):
    return {"id": job["id"], "state": job["state"], "step": job["step"], "done": job["done"],
            "result": job["result"], "error": job["error"],
            "log": "\n".join(job["_log"][-140:])}


# ---------------- HTTP ----------------
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def _serve(self, base, rel, download=False):
        rel = rel.split("?")[0].lstrip("/")
        path = os.path.normpath(os.path.join(base, rel))
        if not path.startswith(os.path.normpath(base)) or not os.path.isfile(path):
            self.send_error(404); return
        ext = os.path.splitext(path)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", CT.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(os.path.getsize(path)))
        if download:
            self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(path)}"')
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with open(path, "rb") as f:
            shutil.copyfileobj(f, self.wfile)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p.startswith("/api/job/"):
            job = JOBSTATE.get(p[len("/api/job/"):])
            return self._json(job_public(job) if job else {"error": "no such job"}, 200 if job else 404)
        if p.startswith("/jobs/"):
            return self._serve(JOBS, p[len("/jobs/"):], download=("dl" in self.path))
        if p.startswith("/lib/"):
            return self._serve(LIB, p[len("/lib/"):])
        if p == "/" or p == "":
            p = "/index.html"
        return self._serve(SITE, p)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            ctype = self.headers.get("Content-Type", "")
            if self.path == "/api/animate":
                return self._animate(body, ctype)
            if self.path == "/api/rig":
                return self._rig(body, ctype)
            self.send_error(404)
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _save(self, jid, name, item):
        data = item["data"]
        ext = ".glb" if data[:4] == b"glTF" else os.path.splitext(item.get("filename") or "")[1] or ".bin"
        path = os.path.join(JOBS, jid, name + ext)
        with open(path, "wb") as f:
            f.write(data)
        return path

    def _animate(self, body, ctype):
        if "multipart/form-data" not in ctype:
            return self._json({"error": "expected multipart"}, 400)
        boundary = ctype.split("boundary=", 1)[1].strip().strip('"').encode()
        form = parse_multipart(body, boundary)
        if "model" not in form or "video" not in form:
            return self._json({"error": "need model + video"}, 400)
        job = new_job("animate")
        model = self._save(job["id"], "model", form["model"])
        video = self._save(job["id"], "video", form["video"])
        threading.Thread(target=run_animate, args=(job, model, video), daemon=True).start()
        self._json({"id": job["id"]})

    def _rig(self, body, ctype):
        if "application/json" in ctype:
            req = json.loads(body or b"{}")
            src = RIG_SAMPLES.get(req.get("sample"))
            if not src or not os.path.exists(src):
                return self._json({"error": "unknown sample"}, 400)
            job = new_job("rig")
            model = os.path.join(JOBS, job["id"], "model.glb")
            shutil.copyfile(src, model)
        elif "multipart/form-data" in ctype:
            boundary = ctype.split("boundary=", 1)[1].strip().strip('"').encode()
            form = parse_multipart(body, boundary)
            if "model" not in form:
                return self._json({"error": "need model"}, 400)
            job = new_job("rig")
            model = self._save(job["id"], "model", form["model"])
        else:
            return self._json({"error": "expected multipart or json"}, 400)
        threading.Thread(target=run_rig, args=(job, model), daemon=True).start()
        self._json({"id": job["id"]})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    print(f"Temporial demo on http://127.0.0.1:{PORT}")
    print(f"  bash={BASH}\n  A4D_PY={A4D_PY}\n  SKIN_PY={SKIN_PY}")
    Server(("127.0.0.1", PORT), Handler).serve_forever()
