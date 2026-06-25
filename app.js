/* ============================================================
   Temporial live demo — front-end logic
   ============================================================ */
(function () {
  "use strict";
  var rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LIVE = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname);  // backend only on localhost
  var REPO = "https://github.com/AndrewTay/temporial-demo";

  /* ---------- file:// guard (model-viewer + /api need the server) ---------- */
  if (location.protocol === "file:") {
    var warn = document.createElement("div");
    warn.className = "file-warn";
    warn.innerHTML = "⚠ Open the demo through its local server — <b>http://127.0.0.1:8770</b>. " +
      "As a <code>file://</code> page the 3D viewer and pipelines can't load.";
    var put = function () { document.body.insertBefore(warn, document.body.firstChild); };
    if (document.body) put(); else document.addEventListener("DOMContentLoaded", put);
  }

  /* ---------- scroll-scrub video background (flower_video.mp4) ---------- */
  (function () {
    var VIDEO_URL = "assets/flower_video.mp4";
    var canvas = document.getElementById("video-canvas");
    var videoEl = document.getElementById("video-fallback");
    if (!canvas || !videoEl) return;
    var ctx = canvas.getContext("2d");
    var frames = [], framesReady = false, lastIdx = -1, seeking = false;

    function resizeCanvas() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      lastIdx = -1;
    }
    function progress() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      return h > 0 ? Math.max(0, Math.min(1, y / h)) : 0;
    }
    function draw(frame) {
      var cw = canvas.width, ch = canvas.height;
      var s = Math.max(cw / frame.width, ch / frame.height);
      var dw = frame.width * s, dh = frame.height * s;
      ctx.drawImage(frame, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    }
    async function extract() {
      try {
        var resp = await fetch(VIDEO_URL); if (!resp.ok) throw 0;
        var url = URL.createObjectURL(await resp.blob());
        var v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
        await new Promise(function (res, rej) { v.onloadedmetadata = res; v.onerror = rej; setTimeout(rej, 15000); });
        var sc = Math.min(1, 1280 / v.videoWidth);
        var sw = Math.round(v.videoWidth * sc), sh = Math.round(v.videoHeight * sc);
        var n = Math.max(30, Math.min(120, Math.round(v.duration * 24)));
        for (var i = 0; i < n; i++) {
          v.currentTime = (i / (n - 1)) * (v.duration - 0.05);
          await new Promise(function (res, rej) {
            var on = function () { v.removeEventListener("seeked", on); res(); };
            v.addEventListener("seeked", on); setTimeout(function () { v.removeEventListener("seeked", on); rej(); }, 3000);
          });
          frames.push(await createImageBitmap(v, { resizeWidth: sw, resizeHeight: sh }));
        }
        // some browsers/headless envs decode video to black via createImageBitmap —
        // verify a frame is non-black before committing, else use the native <video> scrub
        var ok = false;
        if (frames.length) {
          var t = document.createElement("canvas"); t.width = t.height = 8;
          var tc = t.getContext("2d"); tc.drawImage(frames[frames.length >> 1], 0, 0, 8, 8);
          var d = tc.getImageData(0, 0, 8, 8).data, sum = 0;
          for (var k = 0; k < d.length; k += 4) sum += d[k] + d[k + 1] + d[k + 2];
          ok = sum > 16;
        }
        if (ok) { framesReady = true; canvas.style.visibility = "visible"; videoEl.style.display = "none"; }
        else { frames.length = 0; }   // fall back to <video> currentTime scrub
        URL.revokeObjectURL(url);
      } catch (e) { /* keep <video> seek fallback */ }
    }
    function tick() {
      var p = progress();
      if (framesReady && frames.length) {
        var idx = Math.round(p * (frames.length - 1));
        if (idx !== lastIdx) { lastIdx = idx; if (frames[idx]) draw(frames[idx]); }
      } else if (videoEl.duration && isFinite(videoEl.duration) && videoEl.readyState >= 1) {
        var t = p * videoEl.duration;
        if (!seeking && Math.abs(videoEl.currentTime - t) > 0.001) { seeking = true; videoEl.currentTime = t; }
      }
      requestAnimationFrame(tick);
    }
    videoEl.addEventListener("seeked", function () { seeking = false; });
    videoEl.addEventListener("stalled", function () { seeking = false; });
    videoEl.addEventListener("loadeddata", function () { try { videoEl.currentTime = 0; } catch (e) {} });

    var lowPower = rm || (window.matchMedia && window.matchMedia("(max-width:700px)").matches);
    if (lowPower) { canvas.style.visibility = "hidden"; }   // skip the heavy scrub on mobile / reduced-motion
    else {
      canvas.style.visibility = "hidden";
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas, { passive: true });
      requestAnimationFrame(tick);
      extract();
    }
  })();

  /* ---------- ambient: particles ---------- */
  var pc = document.getElementById("particles"), px = pc.getContext("2d"), parts = [];
  function sizeParts() {
    pc.width = window.innerWidth; pc.height = window.innerHeight;
    parts = [];
    var n = Math.floor((pc.width * pc.height) / 15000);
    for (var i = 0; i < n; i++) parts.push({
      x: Math.random() * pc.width, y: Math.random() * pc.height,
      vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22,
      s: Math.random() * 1.4 + .4, o: Math.random() * .5 + .15
    });
  }
  function drawParts() {
    px.clearRect(0, 0, pc.width, pc.height);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = pc.width; if (p.x > pc.width) p.x = 0;
      if (p.y < 0) p.y = pc.height; if (p.y > pc.height) p.y = 0;
      px.beginPath(); px.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      px.fillStyle = "rgba(170,200,255," + p.o + ")"; px.fill();
    }
    requestAnimationFrame(drawParts);
  }
  sizeParts(); window.addEventListener("resize", sizeParts, { passive: true });
  if (rm) drawParts.call(); else drawParts();

  /* ---------- nav + scroll progress ---------- */
  var nav = document.getElementById("nav"), prog = document.getElementById("progress");
  function onScroll() {
    var st = window.pageYOffset || document.documentElement.scrollTop;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.width = (h > 0 ? st / h * 100 : 0) + "%";
    nav.classList.toggle("scrolled", st > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- reveal on scroll ---------- */
  var reveals = [].slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && !rm) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add("in"); });

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function fmtBytes(b) { return b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB"; }
  function fmtElapsed(s) { return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s"; }

  function makeViewer(src, animated) {
    var mv = document.createElement("model-viewer");
    mv.setAttribute("src", src);
    mv.setAttribute("camera-controls", "");
    mv.setAttribute("auto-rotate", "");
    mv.setAttribute("rotation-per-second", "20deg");
    mv.setAttribute("interaction-prompt", "none");
    mv.setAttribute("shadow-intensity", "0.45");
    mv.setAttribute("exposure", "0.98");
    mv.setAttribute("environment-image", "neutral");
    mv.setAttribute("camera-orbit", "-22deg 80deg auto");
    mv.setAttribute("loading", "eager");   // on-demand viewers reflect explicit intent
    if (animated) mv.setAttribute("autoplay", "");
    return mv;
  }

  /* ---------- a Tool controller (animate | rig) ---------- */
  function Tool(rootId, kind) {
    var root = document.getElementById(rootId);
    if (!root) return;
    var STEPS = kind === "animate" ? ["upload", "seg", "w1", "w2", "w3", "build"]
      : kind === "generate" ? ["upload", "generate", "build"]
      : ["upload", "rig", "build"];
    var MSG = kind === "animate" ? {
      upload: "Uploading files…", seg: "Segmenting + extracting native windows…",
      w1: "ActionMesh · window 1 / 3…", w2: "ActionMesh · window 2 / 3 (anchored)…",
      w3: "ActionMesh · window 3 / 3 (anchored)…", build: "Chaining + anti-drift · rendering GIF…"
    } : kind === "generate" ? {
      upload: "Uploading image…", generate: "Generating textured mesh…", build: "Fetching + exporting .glb…"
    } : {
      upload: "Uploading file…", rig: "Predicting skeleton + skin weights…", build: "Binding + exporting rig…"
    };

    var files = {};           // input-name -> File
    var stage = $(".stage", root), result = $(".result", root), banner = $(".banner", root);
    var runBtn = $("[data-run]", root);
    var runMsg = $(".run-msg", root), elapsedEl = $(".elapsed", root), proglog = $(".proglog", root);
    var required = kind === "animate" ? ["model", "video"] : kind === "generate" ? ["image"] : ["model"];

    /* dropzones */
    $all(".dropzone", root).forEach(function (dz) {
      var name = dz.dataset.input, input = $("input", dz);
      dz.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function (e) { if (e.target.files[0]) setFile(dz, name, e.target.files[0]); });
      ["dragover", "dragenter"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("hot"); }); });
      ["dragleave", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("hot"); }); });
      dz.addEventListener("drop", function (e) { var f = e.dataTransfer.files[0]; if (f) setFile(dz, name, f); });
    });

    function setFile(dz, name, file) {
      files[name] = file;
      dz.classList.add("filled");
      var body = $(".dz-body", dz);
      var thumb = "";
      if (/video|\.mp4$/i.test(file.type + file.name)) {
        var u = URL.createObjectURL(file);
        thumb = '<video class="thumb" muted autoplay loop playsinline src="' + u + '"></video>';
      }
      body.innerHTML = '<div class="dz-ico">✓</div><div class="dz-file">' + file.name + '</div>' +
        '<div class="dz-s">' + fmtBytes(file.size) + ' · click to replace</div>' + thumb;
      refreshRun();
    }
    function refreshRun() {
      runBtn.disabled = !required.every(function (k) { return files[k]; });
    }

    /* samples */
    $all(".sample", root).forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); sample(a.dataset.sample); });
    });

    var ANIM_SAMPLES = {
      "cat-groom": { model: "models/cat_groom.glb", gif: "samples/cat_groom.gif", stat: "Cat · groom · M5 native chain" },
      "pug-walk": { model: "models/pug_walk.glb", gif: "samples/pug_walk.gif", stat: "Pug · walk · textured" }
    };
    function sample(id) {
      if (kind === "animate" && ANIM_SAMPLES[id]) {
        // instant: precomputed real result
        hideErr(); stage.classList.remove("show");
        renderAnimate(ANIM_SAMPLES[id], "precomputed sample");
        result.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (kind === "rig") {
        // live: run the real rig pipeline on a bundled mesh
        startRun({ sample: id });
      }
    }

    /* run */
    runBtn.addEventListener("click", function () { startRun(null); });

    function startRun(sampleReq) {
      if (!LIVE) return showLocalOnly();
      hideErr(); result.classList.remove("show");
      stage.classList.add("show");
      paintSteps([], STEPS[0]);
      runMsg.textContent = "Starting…"; proglog.textContent = "";
      runBtn.disabled = true;
      var t0 = Date.now();
      var timer = setInterval(function () { elapsedEl.textContent = fmtElapsed(Math.floor((Date.now() - t0) / 1000)); }, 1000);

      var url = kind === "animate" ? "/api/animate" : kind === "generate" ? "/api/generate" : "/api/rig";
      var opts;
      if (sampleReq) {
        opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sampleReq) };
      } else {
        var fd = new FormData();
        required.forEach(function (k) { fd.append(k, files[k]); });
        if (kind === "generate") fd.append("mode", "local");
        opts = { method: "POST", body: fd };
      }
      fetch(url, opts).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) throw new Error(j.error);
        poll(j.id, t0, timer);
      }).catch(function (e) { clearInterval(timer); fail(e.message); });
    }

    function poll(id, t0, timer) {
      fetch("/api/job/" + id).then(function (r) { return r.json(); }).then(function (j) {
        if (j.log) { proglog.textContent = j.log; proglog.scrollTop = proglog.scrollHeight; }
        if (j.state === "error") { clearInterval(timer); return fail(j.error || "pipeline failed", j.log); }
        paintSteps(j.done || [], j.step);
        runMsg.textContent = (j.step && MSG[j.step]) ? MSG[j.step] : (j.state === "queued" ? "Queued (GPU busy)…" : "Working…");
        if (j.state === "done") {
          clearInterval(timer);
          var secs = Math.floor((Date.now() - t0) / 1000);
          paintSteps(STEPS, null);
          runMsg.textContent = "Done in " + fmtElapsed(secs);
          $(".spinner", root).style.visibility = "hidden";
          runBtn.disabled = false; refreshRun();
          if (kind === "animate") renderAnimate(j.result, j.result.stat || "");
          else if (kind === "generate") renderGen(j.result);
          else renderRig(j.result);
          return;
        }
        setTimeout(function () { poll(id, t0, timer); }, 1400);
      }).catch(function (e) { clearInterval(timer); fail(e.message); });
    }

    function paintSteps(done, active) {
      $all(".step-chip", root).forEach(function (c) {
        var k = c.dataset.step;
        c.classList.toggle("done", done.indexOf(k) >= 0);
        c.classList.toggle("active", k === active);
      });
      var sp = $(".spinner", root); if (sp) sp.style.visibility = active ? "visible" : "hidden";
    }

    /* render results */
    function renderAnimate(res, stat) {
      var mSlot = $('[data-slot="model"]', result), gSlot = $('[data-slot="gif"]', result);
      mSlot.querySelectorAll("model-viewer").forEach(function (n) { n.remove(); });
      mSlot.appendChild(makeViewer(res.model, true));
      gSlot.innerHTML = '<img src="' + res.gif + '" alt="animated gif"/>';
      $('[data-dl="model"]', result).href = res.model;
      $('[data-dl="gif"]', result).href = res.gif;
      $("[data-stat]", result).innerHTML = stat ? "<b>✓</b> " + stat : "";
      result.classList.add("show");
    }
    function renderGen(res) {
      var mSlot = $('[data-slot="model"]', result);
      mSlot.innerHTML = "";
      mSlot.appendChild(makeViewer(res.model, false));
      $('[data-dl="model"]', result).href = res.model;
      $("[data-stat]", result).innerHTML = res.source ? "<b>✓</b> " + res.source : "generated";
      result.classList.add("show");
    }
    function renderRig(res) {
      var mSlot = $('[data-slot="model"]', result);
      mSlot.innerHTML = "";
      var host = document.createElement("div");
      host.className = "skel-cell"; host.style.cssText = "position:absolute;inset:0";
      mSlot.appendChild(host);
      $('[data-dl="model"]', result).href = res.model;
      var stat = $("[data-stat]", result);
      stat.innerHTML = res.bones ? "<b>" + res.bones + "</b> bones · skin weights bound" : "rig bound";
      window.__whenSkelReady(function () {
        window.mountSkel(host, res.model, { skeleton: true, onload: function (info) {
          if (info && info.bones) stat.innerHTML = "<b>" + info.bones + "</b> bones · skin weights bound";
        } });
      });
      result.classList.add("show");
    }

    function fail(msg, log) {
      $(".spinner", root).style.visibility = "hidden";
      runBtn.disabled = false; refreshRun();
      banner.className = "banner err show";
      banner.innerHTML = "⚠ " + (msg || "Something went wrong") + (log ? '<br><span style="opacity:.7;font-family:var(--mono);font-size:.8em">' + String(log).slice(-300) + "</span>" : "");
    }
    function hideErr() { banner.classList.remove("show"); banner.innerHTML = ""; }

    function showLocalOnly() {
      stage.classList.remove("show"); result.classList.remove("show");
      banner.className = "banner info show";
      banner.innerHTML = "⚙ The live " + (kind === "animate" ? "animate" : "rig") +
        " pipeline runs locally on a GPU. <a href=\"" + REPO + "\" target=\"_blank\" rel=\"noopener\">Get the code →</a> " +
        "to run it yourself — meanwhile, try the " + (kind === "animate" ? "samples above and the " : "") + "gallery below.";
    }
  }

  Tool("tool-generate", "generate");
  Tool("tool-animate", "animate");
  Tool("tool-rig", "rig");

  /* ---------- gallery: click-to-load heavy 3D ---------- */
  $all(".load3d").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.replaceWith(makeViewer(btn.dataset.glb, true));
    });
  });

  /* ---------- gallery driving videos: play only when visible ---------- */
  if ("IntersectionObserver" in window) {
    var vio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else v.pause();
      });
    }, { threshold: 0.15 });
    $all(".frame video").forEach(function (v) { vio.observe(v); });
  }

  /* ---------- skeleton viewer (Three.js, window.mountSkel) ---------- */
  function whenSkelReady(cb) {
    if (window.mountSkel) return cb();
    var t = setInterval(function () { if (window.mountSkel) { clearInterval(t); cb(); } }, 120);
  }
  window.__whenSkelReady = whenSkelReady;
  $all(".load-skel").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var host = document.createElement("div");
      host.className = "skel-cell"; host.style.cssText = "position:absolute;inset:0";
      btn.replaceWith(host);
      whenSkelReady(function () { window.mountSkel(host, btn.dataset.skel, { skeleton: true, autorotate: true }); });
    });
  });
})();
