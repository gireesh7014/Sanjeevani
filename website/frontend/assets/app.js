(() => {
  "use strict";

  // Use same-origin API when served by FastAPI; fall back to local dev server for file:// preview.
  const API_BASE =
    window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";

  const $ = (id) => document.getElementById(id);
  const els = {
    backendPill: $("backend-pill"), backendText: $("backend-text"),
    themeToggle: $("theme-toggle"), iconMoon: $("theme-icon-moon"), iconSun: $("theme-icon-sun"),
    navToggle: $("nav-toggle"), mobileNav: $("mobile-nav"),
    heroTry: $("hero-try-text"), ecg: $("hero-ecg-path"),
    slipTimestamp: $("slip-timestamp"), sessionChip: $("session-chip"), footerMeta: $("footer-meta"),
    personaPatient: $("persona-patient"), personaAsha: $("persona-asha"), personaHint: $("persona-hint"),
    langSelect: $("lang-select"), langGrid: $("lang-grid"),
    modeSpeak: $("mode-speak"), modeType: $("mode-type"),
    panelSpeak: $("panel-speak"), panelType: $("panel-type"), recTimer: $("rec-timer"),
    recordBtn: $("record-btn"), recordLabel: $("record-label"), recordSub: $("record-sub"),
    visualizer: $("visualizer"), audioPreview: $("audio-preview"),
    discardAudio: $("discard-audio"), audioSize: $("audio-size"),
    textInput: $("text-input"), charCount: $("char-count"),
    submitBtn: $("submit-btn"), submitLabel: $("submit-label"),
    memoryNote: $("memory-note"),
    turnCount: $("turn-count"), threadLang: $("thread-lang"),
    downloadBtn: $("download-btn"), copyAllBtn: $("copy-all-btn"), newConvoBtn: $("new-convo-btn"),
    emergencyBanner: $("emergency-banner"), emergencyText: $("emergency-text"),
    threadEmpty: $("thread-empty"), threadLoading: $("thread-loading"),
    loadingSteps: $("loading-steps"), thread: $("thread"),
    askAgainBtn: $("ask-again-btn"), toastStack: $("toast-stack"),
  };

  let mode = "speak";
  let persona = "patient";
  let languages = [];
  let sessionId = null;
  let turns = [];
  let userLat = null, userLng = null;
  let isRecording = false, mediaRecorder = null, recordedChunks = [], recordedBlob = null;
  let audioCtx = null, analyser = null, animFrame = null, recStart = 0, timerInt = null;
  let sending = false;

  const TRIAGE_LABELS = { self_care: "Self-care", routine: "Routine", urgent: "Urgent", emergency: "Emergency", unknown: "Needs review" };

  /* ---------- toasts ---------- */
  function toast(msg, kind = "info", ms = 4200) {
    const t = document.createElement("div");
    t.className = `toast ${kind}`;
    t.innerHTML = `<span aria-hidden="true">${kind === "error" ? "⚠" : kind === "success" ? "✓" : "ℹ"}</span><span></span>`;
    t.lastChild.textContent = msg;
    els.toastStack.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; setTimeout(() => t.remove(), 420); }, ms);
  }

  /* ---------- theme ---------- */
  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sanjeevani-theme", next); } catch {}
    const dark = next === "dark";
    els.iconMoon.classList.toggle("hidden", dark);
    els.iconSun.classList.toggle("hidden", !dark);
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("sanjeevani-theme"); } catch {}
    setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    els.themeToggle.addEventListener("click", () =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  }

  /* ---------- backend health ---------- */
  async function checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      els.backendPill.classList.add("online");
      els.backendText.textContent = "Backend online";
    } catch {
      els.backendPill.classList.add("offline");
      els.backendText.textContent = "Backend offline";
      toast("Backend not reachable. Start it with: uvicorn website.backend.main:app --port 8000", "error", 7000);
    }
  }

  /* ---------- languages ---------- */
  async function loadLanguages() {
    try {
      const res = await fetch(`${API_BASE}/api/languages`);
      if (!res.ok) throw new Error();
      languages = await res.json();
    } catch { languages = []; }
    for (const l of languages) {
      const o = document.createElement("option");
      o.value = l.code;
      o.textContent = `${l.name} · ${l.native_name}`;
      els.langSelect.appendChild(o);
    }
    renderLangGrid();
  }
  function langName(code) {
    const m = languages.find((l) => l.code === code);
    return m ? m.name : (code || "—");
  }
  function renderLangGrid() {
    els.langGrid.innerHTML = "";
    if (!languages.length) {
      els.langGrid.innerHTML = `<p style="color:var(--ink-faint);font-size:14px">Language list unavailable — is the backend running?</p>`;
      return;
    }
    for (const l of languages) {
      const b = document.createElement("button");
      b.className = "lang-card";
      b.innerHTML = `<b></b><span></span><small></small>`;
      b.querySelector("b").textContent = l.name;
      b.querySelector("span").textContent = l.native_name;
      b.querySelector("small").textContent = `code · ${l.code}`;
      b.title = `Ask in ${l.name}`;
      b.addEventListener("click", () => {
        els.langSelect.value = l.code;
        setMode("type");
        document.getElementById("consult").scrollIntoView({ behavior: "smooth" });
        toast(`Language set to ${l.name}. Type your question to begin.`, "success");
      });
      els.langGrid.appendChild(b);
    }
  }

  /* ---------- persona + mode ---------- */
  function setPersona(next) {
    persona = next;
    const isPatient = next === "patient";
    els.personaPatient.classList.toggle("is-active", isPatient);
    els.personaAsha.classList.toggle("is-active", !isPatient);
    els.personaPatient.setAttribute("aria-selected", String(isPatient));
    els.personaAsha.setAttribute("aria-selected", String(!isPatient));
    els.personaHint.textContent = isPatient
      ? "Plain, reassuring explanations with next steps."
      : "ASHA mode: red-flag checklist + referral guidance, slightly more clinical.";
  }
  function setMode(next) {
    mode = next;
    const speaking = next === "speak";
    els.modeSpeak.classList.toggle("is-active", speaking);
    els.modeType.classList.toggle("is-active", !speaking);
    els.modeSpeak.setAttribute("aria-selected", String(speaking));
    els.modeType.setAttribute("aria-selected", String(!speaking));
    els.panelSpeak.classList.toggle("hidden", !speaking);
    els.panelType.classList.toggle("hidden", speaking);
    updateSubmitState();
  }

  /* ---------- recording + visualizer ---------- */
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  function drawVisualizer() {
    const canvas = els.visualizer, ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!analyser) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--line") || "#dbe6e0";
      for (let x = 8; x < W; x += 14) { ctx.fillRect(x, H / 2 - 2, 5, 4); }
      animFrame = requestAnimationFrame(drawVisualizer);
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const bars = 48, gap = 5, bw = (W - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const v = data[Math.floor((i / bars) * data.length * 0.7)] / 255;
      const h = 4 + v * (H - 10);
      const x = i * (bw + gap), y = (H - h) / 2;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, "#f2b544"); grad.addColorStop(1, "#1a5a53");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, bw, h, 3) : ctx.rect(x, y, bw, h);
      ctx.fill();
    }
    animFrame = requestAnimationFrame(drawVisualizer);
  }
  async function toggleRecording() {
    if (sending) return;
    if (isRecording) { try { mediaRecorder.stop(); } catch {} return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Microphone not supported in this browser. Please type instead.", "error");
      setMode("type");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        els.audioPreview.src = URL.createObjectURL(recordedBlob);
        els.audioPreview.classList.remove("hidden");
        els.discardAudio.classList.remove("hidden");
        els.audioSize.textContent = `${(recordedBlob.size / 1024).toFixed(0)} KB · ${recordedBlob.type || "audio"}`;
        stream.getTracks().forEach((t) => t.stop());
        teardownAudio();
        setRecordingUI(false);
        updateSubmitState();
      };
      // live visualizer
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      mediaRecorder.start();
      recStart = Date.now();
      els.recTimer.textContent = "00:00";
      timerInt = setInterval(() => { els.recTimer.textContent = fmtTime(Date.now() - recStart); }, 250);
      setRecordingUI(true);
    } catch {
      toast("Microphone access was denied. Allow access or type your question.", "error");
    }
  }
  function teardownAudio() {
    if (timerInt) clearInterval(timerInt);
    timerInt = null;
    analyser = null;
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
  }
  function setRecordingUI(active) {
    isRecording = active;
    els.recordBtn.classList.toggle("is-recording", active);
    els.recordBtn.setAttribute("aria-pressed", String(active));
    els.recordLabel.textContent = active ? "Recording… tap to stop" : recordedBlob ? "Tap to re-record" : "Tap to speak";
    els.recordSub.textContent = active ? els.recTimer.textContent + " · tap to stop" : "Up to ~60s · WebM / WAV";
  }

  /* ---------- submit gating ---------- */
  function updateSubmitState() {
    if (sending) { els.submitBtn.disabled = true; return; }
    const ready = mode === "speak" ? !!recordedBlob : els.textInput.value.trim().length > 0;
    els.submitBtn.disabled = !ready;
  }

  /* ---------- loading ---------- */
  const LOAD_STEPS = ["Listening…", "Transcribing speech…", "Translating…", "Thinking carefully…", "Grounding in WHO sources…"];
  let loadInt = null, loadIdx = 0;
  function setLoading(on) {
    sending = on;
    els.threadLoading.classList.toggle("hidden", !on);
    if (on) {
      loadIdx = 0;
      els.loadingSteps.textContent = LOAD_STEPS[0];
      loadInt = setInterval(() => {
        loadIdx = (loadIdx + 1) % LOAD_STEPS.length;
        els.loadingSteps.textContent = LOAD_STEPS[loadIdx];
      }, 1400);
      els.threadEmpty.classList.add("hidden");
      els.submitLabel.textContent = "Working…";
    } else {
      clearInterval(loadInt);
      els.submitLabel.textContent = "Ask Sanjeevani";
    }
    updateSubmitState();
  }

  /* ---------- submit ---------- */
  async function submit() {
    if (sending) return;
    const language = els.langSelect.value;
    setLoading(true);
    try {
      let response;
      if (mode === "speak") {
        if (!recordedBlob) throw new Error("Record a voice note first.");
        const form = new FormData();
        form.append("audio", recordedBlob, "recording.webm");
        form.append("language", language);
        form.append("mode", persona);
        if (sessionId) form.append("session_id", sessionId);
        if (userLat !== null) form.append("lat", String(userLat));
        if (userLng !== null) form.append("lng", String(userLng));
        response = await fetch(`${API_BASE}/api/ask/audio`, { method: "POST", body: form });
      } else {
        const text = els.textInput.value.trim();
        if (!text) throw new Error("Type your question first.");
        response = await fetch(`${API_BASE}/api/ask/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language, session_id: sessionId, mode: persona, lat: userLat, lng: userLng }),
        });
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${response.status})`);
      }
      const data = await response.json();
      pushTurn(data);
      toast("Answer ready.", "success", 2500);
    } catch (err) {
      toast(err.message || "Something went wrong. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- thread rendering ---------- */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function pushTurn(data) {
    sessionId = data.session_id;
    turns.push(data);
    els.threadEmpty.classList.add("hidden");
    appendUserMsg(data);
    appendAiMsg(data);
    // chrome
    els.turnCount.textContent = String(turns.length);
    els.threadLang.textContent = data.detected_language_name || langName(data.detected_language);
    els.sessionChip.textContent = `session · ${String(sessionId).slice(0, 8)}…`;
    els.sessionChip.classList.add("live");
    els.footerMeta.textContent = `session · ${sessionId} · ${turns.length} turn${turns.length > 1 ? "s" : ""}`;
    els.memoryNote.classList.remove("hidden");
    els.downloadBtn.disabled = false;
    els.copyAllBtn.disabled = false;
    // emergency
    const em = !!data.is_emergency;
    els.emergencyBanner.classList.toggle("hidden", !em);
    if (em) els.emergencyText.textContent = stripHtml(data.function_note) || "Call 108 or go to the nearest hospital now.";
    els.thread.scrollTop = els.thread.scrollHeight;
  }
  function stripHtml(s) {
    const d = document.createElement("div");
    d.innerHTML = String(s || "");
    return d.textContent || "";
  }
  function appendUserMsg(data) {
    const wrap = document.createElement("div");
    wrap.className = "msg";
    const who = data.transcript && data.transcript !== data.english_text ? data.transcript : data.english_text;
    wrap.innerHTML = `<div class="msg-user"></div><div class="msg-meta mono"></div>`;
    wrap.querySelector(".msg-user").textContent = who || "(empty)";
    wrap.querySelector(".msg-meta").textContent =
      `${data.detected_language_name || langName(data.detected_language)} · ${mode === "speak" ? "voice" : "typed"} · ${persona === "asha_worker" ? "ASHA mode" : "patient mode"}`;
    els.thread.appendChild(wrap);
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  }
  function appendAiMsg(data) {
    const wrap = document.createElement("div");
    wrap.className = "msg";
    const label = TRIAGE_LABELS[data.triage] || data.triage || "Assessment";
    const conf = typeof data.confidence === "number" ? Math.round(data.confidence * 100) : null;
    const stampCls = data.is_grounded ? "stamp grounded" : "stamp";
    const stampTxt = data.is_grounded ? "◉ WHO SOURCED" : "DRAFT · pending clinical source";
    const conds = (data.possible_conditions || []).map((c) => `<span class="flag cond">${esc(c)}</span>`).join("");
    const flags = (data.red_flags || []).map((f) => `<span class="flag">⚑ ${esc(f)}</span>`).join("");
    const srcs = (data.sources || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">↗ ${esc(hostOf(u))}</a>`).join(" · ");
    const fnote = data.function_note && !data.is_emergency ? `<p class="msg-detail">ℹ <b>Note:</b> ${esc(stripHtml(data.function_note))}</p>` : "";
    const fallback = data.used_fallback ? `<p class="msg-detail">⚠ Answered in safe fallback mode — structured triage unavailable for this reply.</p>` : "";
    const answer = data.native_answer || data.answer || "No answer returned.";

    wrap.innerHTML = `
      <div class="msg-ai">
        <div class="msg-ai-head">
          <span class="${stampCls}">${stampTxt}</span>
          ${data.used_fallback ? "" : `<span class="triage-badge triage-${esc(data.triage || "unknown")}">${esc(label)}</span>`}
          ${conf !== null && !data.used_fallback ? `<span class="conf-bar" title="Model confidence"><span class="conf-fill" style="width:${conf}%"></span></span><span class="conf-text mono">${conf}%</span>` : ""}
        </div>
        <p class="msg-answer"></p>
        ${conds ? `<div class="msg-flags"><b style="font-size:12px;color:var(--ink-faint)">Possible:</b> ${conds}</div>` : ""}
        ${flags ? `<div class="msg-flags"><b style="font-size:12px;color:var(--ink-faint)">Watch for:</b> ${flags}</div>` : ""}
        ${fnote}${fallback}
        ${srcs ? `<p class="msg-sources"><b>Source:</b> ${srcs}</p>` : ""}
        <button class="msg-toggle" data-act="toggle">Show transcript + English translation ▾</button>
        <div class="msg-hidden hidden">
          <p class="msg-original"></p>
          <p class="msg-english"></p>
        </div>
        <div class="msg-actions">
          <button class="mini-btn" data-act="copy">⧉ Copy answer</button>
          <button class="mini-btn" data-act="listen">▶ Listen</button>
        </div>
      </div>`;
    wrap.querySelector(".msg-answer").textContent = answer;
    wrap.querySelector(".msg-original").textContent = `Heard (${data.detected_language_name || "?"}): ${data.transcript || "—"}`;
    wrap.querySelector(".msg-english").textContent = `English: ${data.english_text || "—"}`;

    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "toggle") {
        const h = wrap.querySelector(".msg-hidden");
        h.classList.toggle("hidden");
        btn.textContent = h.classList.contains("hidden") ? "Show transcript + English translation ▾" : "Hide transcript + translation ▴";
      } else if (act === "copy") {
        navigator.clipboard.writeText(answer).then(
          () => toast("Answer copied.", "success", 2000),
          () => toast("Copy failed in this browser.", "error"));
      } else if (act === "listen") {
        speak(answer, btn);
      }
    });
    els.thread.appendChild(wrap);
  }

  /* ---------- speech ---------- */
  function speak(text, btn) {
    if (!("speechSynthesis" in window)) { toast("Spoken playback not supported here.", "error"); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 1200));
    u.rate = 0.95;
    if (btn) { const orig = btn.textContent; btn.textContent = "■ Stop"; u.onend = u.onerror = () => { btn.textContent = orig; }; }
    speechSynthesis.speak(u);
    if (btn && btn.textContent === "■ Stop") btn.onclick = () => speechSynthesis.cancel();
  }

  /* ---------- export / reset ---------- */
  function downloadSummary() {
    if (!turns.length) return;
    const lines = [`SANJEEVANI CONSULTATION SUMMARY`, `Session: ${sessionId}`, `Exported: ${new Date().toLocaleString()}`, `Persona: ${persona}`, ``];
    turns.forEach((d, i) => {
      lines.push(`--- Turn ${i + 1} ---`);
      lines.push(`Heard (${d.detected_language_name || d.detected_language}): ${d.transcript}`);
      lines.push(`English: ${d.english_text}`);
      lines.push(`Triage: ${d.triage}${typeof d.confidence === "number" ? ` (${Math.round(d.confidence * 100)}%)` : ""}`);
      if (d.possible_conditions?.length) lines.push(`Possible: ${d.possible_conditions.join("; ")}`);
      if (d.red_flags?.length) lines.push(`Red flags: ${d.red_flags.join("; ")}`);
      lines.push(`Answer: ${d.native_answer || d.answer}`);
      if (d.sources?.length) lines.push(`Sources: ${d.sources.join(", ")}`);
      lines.push(``);
    });
    lines.push(`Disclaimer: general information only — not a diagnosis. Emergency? Call 108.`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sanjeevani-${String(sessionId).slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function clearInputsToTop() {
    document.getElementById("consult").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => (mode === "speak" ? els.recordBtn : els.textInput).focus({ preventScroll: true }), 500);
  }
  async function newConversation() {
    if (sessionId) fetch(`${API_BASE}/api/conversation/${sessionId}/reset`, { method: "POST" }).catch(() => {});
    sessionId = null; turns = [];
    els.thread.innerHTML = "";
    els.threadEmpty.classList.remove("hidden");
    els.emergencyBanner.classList.add("hidden");
    els.memoryNote.classList.add("hidden");
    els.turnCount.textContent = "0";
    els.threadLang.textContent = "no language yet";
    els.sessionChip.textContent = "new session";
    els.sessionChip.classList.remove("live");
    els.footerMeta.textContent = "session · new";
    els.downloadBtn.disabled = true;
    els.copyAllBtn.disabled = true;
    recordedBlob = null; recordedChunks = [];
    els.audioPreview.classList.add("hidden");
    els.discardAudio.classList.add("hidden");
    els.audioSize.textContent = "";
    els.textInput.value = "";
    els.charCount.textContent = "0";
    setRecordingUI(false);
    updateSubmitState();
    toast("New conversation started.", "success", 2200);
    clearInputsToTop();
  }

  /* ---------- init ---------- */
  function init() {
    initTheme();
    checkHealth();
    loadLanguages();
    drawVisualizer();

    els.personaPatient.addEventListener("click", () => setPersona("patient"));
    els.personaAsha.addEventListener("click", () => setPersona("asha_worker"));
    els.modeSpeak.addEventListener("click", () => setMode("speak"));
    els.modeType.addEventListener("click", () => setMode("type"));
    els.recordBtn.addEventListener("click", toggleRecording);
    els.discardAudio.addEventListener("click", () => {
      recordedBlob = null; recordedChunks = [];
      els.audioPreview.removeAttribute("src");
      els.audioPreview.classList.add("hidden");
      els.discardAudio.classList.add("hidden");
      els.audioSize.textContent = "";
      setRecordingUI(false); updateSubmitState();
    });
    els.textInput.addEventListener("input", () => {
      els.charCount.textContent = String(els.textInput.value.length);
      updateSubmitState();
    });
    els.textInput.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
    });
    document.querySelectorAll(".chip[data-sample]").forEach((c) =>
      c.addEventListener("click", () => {
        setMode("type");
        els.textInput.value = c.dataset.sample;
        els.charCount.textContent = String(els.textInput.value.length);
        updateSubmitState();
        els.textInput.focus();
      }));
    els.heroTry.addEventListener("click", () => {
      setMode("type");
      els.textInput.value = "मुझे दो दिन से बुखार और गले में दर्द है, क्या करूं?";
      els.charCount.textContent = String(els.textInput.value.length);
      updateSubmitState();
      document.getElementById("consult").scrollIntoView({ behavior: "smooth" });
    });
    els.submitBtn.addEventListener("click", submit);
    els.askAgainBtn.addEventListener("click", clearInputsToTop);
    els.newConvoBtn.addEventListener("click", newConversation);
    els.downloadBtn.addEventListener("click", downloadSummary);
    els.copyAllBtn.addEventListener("click", () => {
      const last = turns[turns.length - 1];
      if (!last) return;
      navigator.clipboard.writeText(last.native_answer || last.answer || "").then(
        () => toast("Last answer copied.", "success", 2000),
        () => toast("Copy failed.", "error"));
    });
    els.navToggle.addEventListener("click", () => {
      const open = els.mobileNav.classList.toggle("hidden");
      els.navToggle.setAttribute("aria-expanded", String(!open));
    });
    els.mobileNav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => els.mobileNav.classList.add("hidden")));

    // subtle ECG drift
    if (els.ecg) {
      let t = 0;
      setInterval(() => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        t += 1;
        els.ecg.style.transform = `translateX(${-((t % 60) / 2)}px)`;
      }, 120);
    }

    // timestamp + geolocation
    els.slipTimestamp.textContent = new Date().toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => { userLat = p.coords.latitude; userLng = p.coords.longitude; },
        () => {}, { timeout: 8000 });
    }
    updateSubmitState();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
