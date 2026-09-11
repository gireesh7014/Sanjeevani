(() => {
  "use strict";

  // Use same-origin API when served by FastAPI; fall back to local dev server for file:// preview.
  const API_BASE =
    window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";

  const $ = (id) => document.getElementById(id);
  const els = {
    backendPill: $("backend-pill"), backendText: $("backend-text"),
    themeToggle: $("theme-toggle"), iconMoon: $("theme-icon-moon"), iconSun: $("theme-icon-sun"),
    langToggle: $("lang-toggle"), langToggleLabel: $("lang-toggle-label"),
    navToggle: $("nav-toggle"), mobileNav: $("mobile-nav"),
    heroTry: $("hero-try-text"), ecg: $("hero-ecg-path"),
    seasonalCard: $("seasonal-card"), seasonalTitle: $("seasonal-title"),
    seasonalBody: $("seasonal-body"), seasonalAsk: $("seasonal-ask"),
    slipTimestamp: $("slip-timestamp"), sessionChip: $("session-chip"), footerMeta: $("footer-meta"),
    personaPatient: $("persona-patient"), personaAsha: $("persona-asha"), personaHint: $("persona-hint"),
    langSelect: $("lang-select"), langGrid: $("lang-grid"),
    ageGroup: $("age-group"), pregnantCheck: $("pregnant-check"),
    durationInput: $("duration-input"), feverInput: $("fever-input"),
    topicsGrid: $("topics-grid"),
    bmiWeight: $("bmi-weight"), bmiHeight: $("bmi-height"),
    bmiGo: $("bmi-go"), bmiOut: $("bmi-out"),
    eddLmp: $("edd-lmp"), eddGo: $("edd-go"), eddOut: $("edd-out"),
    teekaDob: $("teeka-dob"), teekaGo: $("teeka-go"),
    teekaSummary: $("teeka-summary"), teekaOut: $("teeka-out"),
    helplinesGrid: $("helplines-grid"), schemesGrid: $("schemes-grid"),
    parchiBtn: $("parchi-btn"),
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

  /* ---------- Hindi/English UI toggle ---------- */
  const I18N = {
    en: {
      nav_consult: "Consult", nav_topics: "Topics", nav_tools: "Sehat tools",
      nav_help: "Helplines", nav_how: "How it works", nav_cta: "Start consult",
      hero_eyebrow: "Live prototype · AI4Bharat + Gemma 4 + WHO grounding",
      hero_title: 'बोलिए.<br /><span class="gradient-text">Understand your health</span> in your own language.',
      hero_sub: "Speak or type how you feel in any of 13 Indian languages. Sanjeevani transcribes, translates, triages gently, and explains in plain words — with WHO sources when they match.",
      cta_speak: "Speak now", cta_sample: "Try a sample question",
      consult_kicker: "Consultation · परामर्श", consult_title: "Describe how you're feeling",
      consult_sub: "Your conversation stays in this browser session. Reset anytime.",
      label_lang: "Language · भाषा", details_title: "＋ Thoda vivaran (optional) — age, pregnancy, duration",
      ask_btn: "Ask Sanjeevani",
    },
    hi: {
      nav_consult: "परामर्श", nav_topics: "विषय", nav_tools: "सेहत उपकरण",
      nav_help: "हेल्पलाइन", nav_how: "यह कैसे काम करता है", nav_cta: "परामर्श शुरू करें",
      hero_eyebrow: "लाइव प्रोटोटाइप · AI4Bharat + Gemma 4 + WHO आधार",
      hero_title: 'बोलिए.<br /><span class="gradient-text">अपना स्वास्थ्य समझिए</span> अपनी भाषा में।',
      hero_sub: "13 भारतीय भाषाओं में बोलकर या लिखकर बताइए। संजीवनी सुनती है, अनुवाद करती है, और सरल शब्दों में समझाती है — WHO स्रोतों के साथ, जहाँ मिले।",
      cta_speak: "अभी बोलें", cta_sample: "नमूना प्रश्न आज़माएँ",
      consult_kicker: "परामर्श · Consultation", consult_title: "आपको कैसा लग रहा है, बताइए",
      consult_sub: "आपकी बातचीत इसी ब्राउज़र में रहती है। कभी भी नई शुरुआत करें।",
      label_lang: "भाषा · Language", details_title: "＋ थोड़ा विवरण (वैकल्पिक) — उम्र, गर्भावस्था, अवधि",
      ask_btn: "संजीवनी से पूछें",
    },
  };
  function setUiLang(next) {
    const dict = I18N[next] || I18N.en;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = dict[el.dataset.i18n];
      if (v !== undefined) el.innerHTML = v;
    });
    els.langToggleLabel.textContent = next === "hi" ? "EN" : "हिं";
    els.langToggle.setAttribute("aria-label", next === "hi" ? "Switch to English" : "हिंदी में बदलें");
    try { localStorage.setItem("sanjeevani-ui-lang", next); } catch {}
    document.documentElement.lang = next === "hi" ? "hi" : "en";
  }
  function initUiLang() {
    let saved = null;
    try { saved = localStorage.getItem("sanjeevani-ui-lang"); } catch {}
    setUiLang(saved || "en");
    els.langToggle.addEventListener("click", () => {
      const cur = document.documentElement.lang === "hi" ? "hi" : "en";
      setUiLang(cur === "hi" ? "en" : "hi");
      loadSeasonal();
    });
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
    updateParchiBtn();
  }
  function updateParchiBtn() {
    els.parchiBtn.classList.toggle("hidden", persona !== "asha_worker" || turns.length === 0);
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
  function extraDetails() {
    const age = els.ageGroup.value || null;
    const checked = els.pregnantCheck.checked;
    return {
      age_group: age,
      // Only send pregnancy info when the box state is meaningful: checked
      // means yes; unchecked + ASHA mode still sends explicit no, otherwise omit.
      pregnant: checked ? true : (persona === "asha_worker" ? false : null),
      duration: els.durationInput.value.trim() || null,
      fever: els.feverInput.value.trim() || null,
    };
  }
  async function submit() {
    if (sending) return;
    const language = els.langSelect.value;
    const extra = extraDetails();
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
        if (extra.age_group) form.append("age_group", extra.age_group);
        if (extra.pregnant !== null) form.append("pregnant", String(extra.pregnant));
        if (extra.duration) form.append("duration", extra.duration);
        if (extra.fever) form.append("fever", extra.fever);
        response = await fetch(`${API_BASE}/api/ask/audio`, { method: "POST", body: form });
      } else {
        const text = els.textInput.value.trim();
        if (!text) throw new Error("Type your question first.");
        response = await fetch(`${API_BASE}/api/ask/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language, session_id: sessionId, mode: persona,
            lat: userLat, lng: userLng, age_group: extra.age_group,
            pregnant: extra.pregnant, duration: extra.duration, fever: extra.fever }),
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
    updateParchiBtn();
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
    const facs = (data.facilities || []).map((f) => {
      const maps = f.maps_url
        ? `<a class="dir-btn" href="${esc(f.maps_url)}" target="_blank" rel="noopener">Directions →</a>` : "";
      return `<li><div><b>${esc(f.name)}</b><span class="kind">${esc(f.kind || "hospital")} · OpenStreetMap</span></div>${maps}</li>`;
    }).join("");
    const facCard = facs
      ? `<div class="facility-card"><h4>🏥 Nearby hospitals / clinics — नज़दीकी अस्पताल</h4><ul>${facs}</ul></div>` : "";

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
        ${facCard}
        <button class="msg-toggle" data-act="toggle">Show transcript + English translation ▾</button>
        <div class="msg-hidden hidden">
          <p class="msg-original"></p>
          <p class="msg-english"></p>
        </div>
        <div class="msg-actions">
          <button class="mini-btn" data-act="copy">⧉ Copy answer</button>
          <button class="mini-btn" data-act="speak">🔊 Suno jawab</button>
          <button class="mini-btn" data-act="listen">▶ Browser voice</button>
        </div>
        <audio class="audio-player hidden" controls></audio>
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
      } else if (act === "speak") {
        speakViaBackend(answer, btn, wrap.querySelector(".audio-player"));
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

  /* ---------- spoken answers (Indic Parler-TTS, browser fallback) ---------- */
  async function speakViaBackend(text, btn, audioEl) {
    const clip = text.slice(0, 600);
    btn.classList.add("is-loading");
    const orig = btn.textContent;
    btn.textContent = "…bol rahe hain";
    try {
      const res = await fetch(`${API_BASE}/api/speak`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clip }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      audioEl.src = URL.createObjectURL(blob);
      audioEl.classList.remove("hidden");
      audioEl.play().catch(() => {});
      toast("🔊 Suniye — jawab sunaya ja raha hai.", "success", 2500);
    } catch {
      toast("Server voice unavailable — using browser voice.", "error", 3000);
      speak(text, btn);
    } finally {
      btn.classList.remove("is-loading");
      btn.textContent = orig;
    }
  }

  /* ---------- India features: seasonal, topics, helplines, tools ---------- */
  async function loadSeasonal() {
    try {
      const res = await fetch(`${API_BASE}/api/seasonal`);
      if (!res.ok) throw new Error();
      const s = await res.json();
      const hi = document.documentElement.lang === "hi";
      els.seasonalTitle.textContent = (hi ? s.title_hi : s.title) + ` · ${s.months}`;
      els.seasonalBody.textContent = hi ? s.body_hi : s.body;
      els.seasonalCard.classList.remove("hidden");
      els.seasonalAsk.onclick = () => {
        setMode("type");
        els.textInput.value = s.ask;
        els.charCount.textContent = String(s.ask.length);
        updateSubmitState();
        document.getElementById("consult").scrollIntoView({ behavior: "smooth" });
      };
    } catch { /* advisory is optional; stay hidden offline */ }
  }

  async function loadTopics() {
    try {
      const res = await fetch(`${API_BASE}/api/topics`);
      if (!res.ok) throw new Error();
      const topics = await res.json();
      els.topicsGrid.innerHTML = "";
      for (const t of topics) {
        const b = document.createElement("button");
        b.className = "topic-card";
        b.innerHTML = `<span class="topic-icon"></span><div><b></b><span></span></div>`;
        b.querySelector(".topic-icon").textContent = t.icon;
        b.querySelector("b").textContent = t.label;
        b.querySelector("span").textContent = t.label_hi;
        b.addEventListener("click", () => {
          setMode("type");
          els.textInput.value = t.question;
          els.charCount.textContent = String(t.question.length);
          updateSubmitState();
          document.getElementById("consult").scrollIntoView({ behavior: "smooth" });
          els.textInput.focus({ preventScroll: true });
        });
        els.topicsGrid.appendChild(b);
      }
    } catch {
      els.topicsGrid.innerHTML = `<p style="color:var(--ink-faint);font-size:14px">Topics unavailable — is the backend running?</p>`;
    }
  }

  async function loadHelplines() {
    try {
      const [hRes, sRes] = await Promise.all([
        fetch(`${API_BASE}/api/helplines`), fetch(`${API_BASE}/api/schemes`),
      ]);
      if (hRes.ok) {
        const list = await hRes.json();
        els.helplinesGrid.innerHTML = "";
        for (const h of list) {
          const a = document.createElement("a");
          a.className = "help-card";
          a.href = h.tel;
          a.innerHTML = `<div class="help-num"></div><b></b><div class="hi"></div><small></small>`;
          a.querySelector(".help-num").textContent = h.number;
          a.querySelector("b").textContent = h.name;
          a.querySelector(".hi").textContent = h.name_hi;
          a.querySelector("small").textContent = `${h.desc} ${h.hours}`;
          els.helplinesGrid.appendChild(a);
        }
      }
      if (sRes.ok) {
        const schemes = await sRes.json();
        els.schemesGrid.innerHTML = "";
        for (const s of schemes) {
          const d = document.createElement("div");
          d.className = "scheme-card";
          d.innerHTML = `<b></b><div class="hi"></div><p></p>`;
          d.querySelector("b").textContent = s.name;
          d.querySelector(".hi").textContent = s.name_hi;
          d.querySelector("p").textContent = s.body;
          els.schemesGrid.appendChild(d);
        }
      }
    } catch {
      els.helplinesGrid.innerHTML = `<p style="color:var(--ink-faint);font-size:14px">Emergency? Call <a href="tel:108"><b>108</b></a> now.</p>`;
    }
  }

  function calcBmi() {
    const w = parseFloat(els.bmiWeight.value), h = parseFloat(els.bmiHeight.value);
    if (!w || !h || w <= 0 || h <= 0) { els.bmiOut.textContent = "Vajan aur lambai likhen."; return; }
    const bmi = w / Math.pow(h / 100, 2);
    // WHO Asian / Indian cut-offs
    const cat = bmi < 18.5 ? "Underweight — poshan par dhyan den" :
      bmi < 23 ? "Normal — badhai! Aise hi rakhen" :
      bmi < 25 ? "Overweight — tel-namak-meetha kam karen" :
      "Obese — doctor/ANM se salah len";
    els.bmiOut.textContent = `BMI: ${bmi.toFixed(1)}\n${cat}\n(Asian cut-off: 23+ adhik vajan)`;
  }

  function calcEdd() {
    if (!els.eddLmp.value) { els.eddOut.textContent = "LMP date chunen."; return; }
    const lmp = new Date(els.eddLmp.value + "T00:00:00");
    if (isNaN(lmp)) { els.eddOut.textContent = "Sahi date chunen."; return; }
    const edd = new Date(lmp.getTime() + 280 * 864e5);
    const now = new Date();
    const weeks = Math.floor((now - lmp) / 864e5 / 7);
    const tri = weeks < 0 ? "—" : weeks < 13 ? "1st trimester" : weeks < 27 ? "2nd trimester" : "3rd trimester";
    els.eddOut.textContent =
      `Due date: ${edd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}\n` +
      (weeks >= 0 ? `Abhi: ~${weeks} hafte · ${tri}\n` : "") +
      "4 ANC jaanch + 180 IFA goliyan + 2 TT/Td teeke — ASHA se sampark rakhen.";
  }

  async function checkTeeka() {
    if (!els.teekaDob.value) { els.teekaSummary.textContent = "Janm-tithi chunen."; return; }
    els.teekaSummary.textContent = "Dekh rahe hain…";
    try {
      const res = await fetch(`${API_BASE}/api/immunization?birthdate=${els.teekaDob.value}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Check failed");
      }
      const data = await res.json();
      const c = data.counts;
      els.teekaSummary.textContent =
        `Umra: ${data.age_label} · ⏰ Due: ${c.due_today} · ⚠ Chhoote: ${c.overdue} · 🔜 Aane wale: ${c.upcoming}`;
      els.teekaOut.innerHTML = "";
      const pill = { overdue: "chhoota", due_today: "abhi", upcoming: "aane wala" };
      for (const d of data.doses) {
        const div = document.createElement("div");
        div.className = `teeka-dose st-${d.status}`;
        div.innerHTML = `<span class="teeka-pill"></span><b></b><span class="due"></span>`;
        div.querySelector(".teeka-pill").textContent = pill[d.status] || d.status;
        div.querySelector("b").textContent = `${d.name} · ${d.name_hi}`;
        div.querySelector(".due").textContent = `${d.due_label} · ${d.due_date}${d.note ? " · " + d.note : ""}`;
        els.teekaOut.appendChild(div);
      }
    } catch (err) {
      els.teekaSummary.textContent = err.message || "Check failed.";
    }
  }

  /* ---------- ASHA referral parchi (print) ---------- */
  function printParchi() {
    const last = turns[turns.length - 1];
    if (!last) { toast("Pehle ek prashn puchhen.", "error"); return; }
    const d = new Date().toLocaleString("en-IN");
    const facRows = (last.facilities || []).map((f) =>
      `<tr><td>${esc(f.name)}</td><td>${esc(f.kind || "")}</td><td>${f.maps_url ? "Maps link attached" : "—"}</td></tr>`).join("");
    const area = document.getElementById("print-area");
    area.innerHTML = `
      <div class="parchi">
        <h1>संजीवनी — Referral Parchi (ASHA)</h1>
        <p>General information slip — NOT a prescription. Diagnosis only by a registered doctor.</p>
        <table>
          <tr><th>Date</th><td>${esc(d)}</td></tr>
          <tr><th>Heard (${esc(last.detected_language_name || "")})</th><td>${esc(last.transcript)}</td></tr>
          <tr><th>Triage</th><td><b>${esc(last.triage)}</b> (${Math.round((last.confidence || 0) * 100)}%)</td></tr>
          <tr><th>Possible</th><td>${esc((last.possible_conditions || []).join(", ") || "—")}</td></tr>
          <tr><th>Red flags</th><td>${esc((last.red_flags || []).join(", ") || "—")}</td></tr>
          <tr><th>Advice (native)</th><td>${esc(last.native_answer || last.answer)}</td></tr>
          <tr><th>Sources</th><td>${esc((last.sources || []).join(", ") || "—")}</td></tr>
        </table>
        ${facRows ? `<h3>Nearby facilities</h3><table>${facRows}</table>` : "<p>Emergency? Call <b>108</b>.</p>"}
        <div class="sign"><span>ASHA signature: ________</span><span>ANM/MO signature: ________</span></div>
      </div>`;
    window.print();
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
      if (d.facilities?.length) lines.push(`Nearby: ${d.facilities.map((f) => f.name).join("; ")}`);
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
    updateParchiBtn();
    els.ageGroup.value = "";
    els.pregnantCheck.checked = false;
    els.durationInput.value = "";
    els.feverInput.value = "";
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
    initUiLang();
    checkHealth();
    loadLanguages();
    loadSeasonal();
    loadTopics();
    loadHelplines();
    drawVisualizer();
    if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
    els.bmiGo.addEventListener("click", calcBmi);
    els.eddGo.addEventListener("click", calcEdd);
    els.teekaGo.addEventListener("click", checkTeeka);
    els.parchiBtn.addEventListener("click", printParchi);

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
