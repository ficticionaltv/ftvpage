/* ============================================================
   FicticionalTV — Reproductor propio (FtvPlayer)
   ------------------------------------------------------------
   Un solo reproductor con interfaz propia que sabe reproducir:
   - Archivos directos: .mp4 / .webm / .ogv / .m4v / .mov (por ejemplo
     archive.org/download/<id>/<archivo>.mp4, o tu propio hosting).
   - Archive.org: pega el link de "details" o "embed" (archive.org/details/<id>)
     y el reproductor busca solo los archivos de video del item y deja
     elegir la calidad.
   - Streaming HLS (.m3u8), con selector de calidad (usa hls.js, se
     descarga solo cuando hace falta).
   - YouTube: usa la API oficial (IFrame Player API) con los controles
     nativos ocultos y los de FicticionalTV encima. El video lo sigue
     sirviendo YouTube.
   - Cualquier otro embed (Vimeo, Dailymotion, etc.): se muestra tal cual
     en un iframe, pero con el logo del canal encima.

   Incluye: logo de canal en la esquina superior izquierda, atajos de
   teclado, velocidad, calidad, saltar intro, siguiente episodio con
   cuenta regresiva, recordar el minuto donde te quedaste, imagen en
   imagen y pantalla completa.

   Uso:
     const p = FtvPlayer.mount(contenedor, {
       src: "https://...", title: "Anime · E1",
       resumeKey: "anime:id:1", introStart: 5, introEnd: 90,
       next: { title: "E2 - ...", onPlay: () => ... }, autoplay: false
     });
     p.load({...})      // cambia de video sin salir de pantalla completa
     p.setOptions({...})// actualiza intro / siguiente sin reiniciar
   ============================================================ */
(function () {
  "use strict";

  const LS_PROGRESS = "ftv_player_progress";
  const LS_PREFS = "ftv_player_prefs";
  const HLS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js";
  const LOGO_DEFAULT = "img/logo-player.png";
  const NEXT_COUNTDOWN = 8;
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

  /* ------------------------------ utilidades ------------------------------ */
  function readJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin almacenamiento */ }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function emitter() {
    const map = {};
    return {
      on(evt, fn) { (map[evt] = map[evt] || []).push(fn); },
      emit(evt, arg) { (map[evt] || []).slice().forEach(fn => { try { fn(arg); } catch (e) { console.error(e); } }); }
    };
  }
  function loadScriptOnce(src, check) {
    return new Promise((resolve, reject) => {
      if (check && check()) { resolve(); return; }
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", reject);
        return;
      }
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("No se pudo cargar " + src));
      document.head.appendChild(s);
    });
  }

  /* ----------------------- detección de la fuente ------------------------- */
  const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;

  function detectSource(raw) {
    let u;
    try { u = new URL(raw, window.location.href); } catch (e) { return { type: "iframe", url: raw }; }
    const host = u.hostname.replace(/^www\./, "");

    if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
      const m = u.pathname.match(/^\/embed\/([\w-]{6,})/);
      if (m) return { type: "youtube", id: m[1] };
    }
    if (host === "archive.org") {
      let m = u.pathname.match(/^\/(?:details|embed)\/([^/?#]+)(?:\/(.+))?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const file = m[2] ? decodeURIComponent(m[2]) : "";
        if (file && VIDEO_EXT.test(file)) {
          return { type: "file", url: `https://archive.org/download/${encodeURIComponent(id)}/${file.split("/").map(encodeURIComponent).join("/")}` };
        }
        return { type: "archive", id, embedUrl: `https://archive.org/embed/${encodeURIComponent(id)}` };
      }
    }
    if (/\.m3u8$/i.test(u.pathname)) return { type: "hls", url: u.href };
    if (VIDEO_EXT.test(u.pathname)) return { type: "file", url: u.href };
    return { type: "iframe", url: raw };
  }

  /* Busca en Archive.org los archivos de video de un item. */
  async function resolveArchive(id) {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("metadata " + res.status);
    const data = await res.json();
    const files = (data.files || []).filter(f => /\.(mp4|m4v|webm|ogv)$/i.test(f.name || "") && !/_thumb|\.thumbs\//i.test(f.name));
    if (!files.length) throw new Error("sin video");
    files.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
    const qualities = files.map(f => {
      const mb = f.size ? Math.round(Number(f.size) / 1048576) + " MB" : "";
      const fmt = (f.format || f.name.split(".").pop()).replace(/^MPEG4$/i, "MP4");
      return {
        label: [fmt, mb].filter(Boolean).join(" · "),
        url: `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split("/").map(encodeURIComponent).join("/")}`,
        std: /h\.?264/i.test(f.format || "")
      };
    });
    let start = qualities.findIndex(q => q.std);
    if (start < 0) start = 0;
    return { qualities, start };
  }

  /* ============================ ADAPTADORES ============================ *
   * Interfaz común (la usa el reproductor sin saber de qué fuente viene):
   * play() pause() paused() seek(t) time() duration() buffered()
   * volume(v?) muted(m?) rate(r?) qualities() quality() setQuality(i)
   * el, destroy(), on(evento, fn)
   * Eventos: play pause ended time waiting playing meta progress rate volume
   *          qualities error
   * ===================================================================== */
  function fileAdapter(stage, info) {
    const em = emitter();
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.preload = "metadata";
    stage.appendChild(v);

    let hls = null, qList = [], qMap = [], qIndex = 0, destroyed = false;

    const forward = {
      play: "play", pause: "pause", ended: "ended", timeupdate: "time", waiting: "waiting", playing: "playing",
      durationchange: "meta", loadedmetadata: "meta", progress: "progress", ratechange: "rate", volumechange: "volume", seeking: "waiting", canplay: "playing"
    };
    Object.keys(forward).forEach(n => v.addEventListener(n, () => em.emit(forward[n])));
    v.addEventListener("error", () => em.emit("error", v.error));

    function setUrl(url, resumeAt, wasPlaying) {
      v.src = url;
      v.load();
      if (resumeAt > 0) {
        v.addEventListener("loadedmetadata", () => { try { v.currentTime = resumeAt; } catch (e) { /* */ } }, { once: true });
      }
      if (wasPlaying) v.play().catch(() => {});
    }

    if (info.type === "hls") {
      const native = v.canPlayType("application/vnd.apple.mpegurl");
      if (native) {
        v.src = info.url;
      } else {
        loadScriptOnce(HLS_SRC, () => window.Hls).then(() => {
          if (destroyed) return;
          if (!window.Hls.isSupported()) { em.emit("error", new Error("HLS no soportado")); return; }
          hls = new window.Hls({ enableWorker: true });
          hls.loadSource(info.url);
          hls.attachMedia(v);
          hls.on(window.Hls.Events.MANIFEST_PARSED, (_, data) => {
            const levels = data.levels || [];
            // Del más alto al más bajo; qMap guarda el índice real de nivel de hls.js.
            const order = levels.map((l, i) => i).sort((a, b) => (levels[b].height || levels[b].bitrate || 0) - (levels[a].height || levels[a].bitrate || 0));
            qList = ["Auto"].concat(order.map(i => (levels[i].height ? levels[i].height + "p" : Math.round((levels[i].bitrate || 0) / 1000) + " kbps")));
            qMap = [-1].concat(order);
            qIndex = 0;
            em.emit("qualities");
          });
          hls.on(window.Hls.Events.ERROR, (_, data) => {
            if (!data || !data.fatal) return;
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) { try { hls.startLoad(); } catch (e) { em.emit("error", data); } }
            else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) { try { hls.recoverMediaError(); } catch (e) { em.emit("error", data); } }
            else em.emit("error", data);
          });
        }).catch(err => em.emit("error", err));
      }
    } else if (info.qualities && info.qualities.length) {
      qList = info.qualities.map(q => q.label);
      qIndex = info.start || 0;
      setUrl(info.qualities[qIndex].url, 0, false);
      setTimeout(() => em.emit("qualities"), 0);
    } else {
      v.src = info.url;
    }

    return {
      el: v,
      on: em.on,
      play() { return v.play(); },
      pause() { v.pause(); },
      paused() { return v.paused; },
      ended() { return v.ended; },
      seek(t) { try { v.currentTime = t; } catch (e) { /* */ } },
      time() { return v.currentTime || 0; },
      duration() { return Number.isFinite(v.duration) ? v.duration : 0; },
      buffered() {
        const b = v.buffered, t = v.currentTime;
        for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.3 && t <= b.end(i)) return b.end(i);
        return b.length ? b.end(b.length - 1) : 0;
      },
      volume(x) { if (x != null) v.volume = clamp(x, 0, 1); return v.volume; },
      muted(x) { if (x != null) v.muted = !!x; return v.muted; },
      rate(x) { if (x != null) v.playbackRate = x; return v.playbackRate; },
      qualities() { return qList; },
      quality() { return qIndex; },
      setQuality(i) {
        if (i === qIndex) return;
        qIndex = i;
        if (hls) { hls.currentLevel = qMap[i] != null ? qMap[i] : -1; }
        else if (info.qualities) setUrl(info.qualities[i].url, v.currentTime, !v.paused);
        em.emit("qualities");
      },
      pip() {
        if (document.pictureInPictureEnabled && v.requestPictureInPicture) {
          if (document.pictureInPictureElement === v) return document.exitPictureInPicture();
          return v.requestPictureInPicture();
        }
      },
      canPip: !!(document.pictureInPictureEnabled),
      destroy() {
        destroyed = true;
        if (hls) { try { hls.destroy(); } catch (e) { /* */ } }
        try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) { /* */ }
        v.remove();
      }
    };
  }

  let ytApiPromise = null;
  function loadYouTubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (typeof prev === "function") prev(); resolve(); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => { ytApiPromise = null; reject(new Error("YouTube API")); };
      document.head.appendChild(s);
    });
    return ytApiPromise;
  }

  function youtubeAdapter(stage, info, opts) {
    const em = emitter();
    const holder = document.createElement("div");
    stage.appendChild(holder);
    let yt = null, ready = false, poll = null, destroyed = false;
    let state = { paused: true, ended: false, vol: 1, muted: false, rate: 1 };
    const pending = [];
    const whenReady = fn => (ready ? fn() : pending.push(fn));

    loadYouTubeApi().then(() => {
      if (destroyed) return;
      yt = new window.YT.Player(holder, {
        videoId: info.id,
        width: "100%", height: "100%",
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3,
          playsinline: 1, autoplay: opts.autoplay ? 1 : 0, origin: window.location.origin, cc_load_policy: 0
        },
        events: {
          onReady() {
            ready = true;
            pending.splice(0).forEach(fn => fn());
            em.emit("meta");
          },
          onStateChange(e) {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) { state.paused = false; state.ended = false; em.emit("play"); em.emit("playing"); startPoll(); }
            else if (e.data === S.PAUSED) { state.paused = true; em.emit("pause"); stopPoll(); }
            else if (e.data === S.BUFFERING) { em.emit("waiting"); }
            else if (e.data === S.ENDED) { state.paused = true; state.ended = true; em.emit("ended"); stopPoll(); }
            else if (e.data === S.CUED) { em.emit("meta"); }
            em.emit("meta");
          },
          onPlaybackRateChange(e) { state.rate = e.data; em.emit("rate"); },
          onError() { em.emit("error", new Error("YouTube")); }
        }
      });
    }).catch(err => em.emit("error", err));

    function startPoll() { stopPoll(); poll = setInterval(() => { em.emit("time"); em.emit("progress"); }, 250); }
    function stopPoll() { if (poll) { clearInterval(poll); poll = null; } }

    return {
      el: holder,
      on: em.on,
      play() { whenReady(() => yt.playVideo()); return Promise.resolve(); },
      pause() { whenReady(() => yt.pauseVideo()); },
      paused() { return state.paused; },
      ended() { return state.ended; },
      seek(t) { whenReady(() => { yt.seekTo(t, true); em.emit("time"); }); },
      time() { return ready ? (yt.getCurrentTime() || 0) : 0; },
      duration() { return ready ? (yt.getDuration() || 0) : 0; },
      buffered() { return ready ? (yt.getVideoLoadedFraction() || 0) * (yt.getDuration() || 0) : 0; },
      volume(x) {
        if (x != null) { state.vol = clamp(x, 0, 1); whenReady(() => yt.setVolume(Math.round(state.vol * 100))); em.emit("volume"); }
        return state.vol;
      },
      muted(x) {
        if (x != null) { state.muted = !!x; whenReady(() => (state.muted ? yt.mute() : yt.unMute())); em.emit("volume"); }
        return state.muted;
      },
      rate(x) {
        if (x != null) { state.rate = x; whenReady(() => yt.setPlaybackRate(x)); em.emit("rate"); }
        return state.rate;
      },
      qualities() { return []; },
      quality() { return 0; },
      setQuality() {},
      pip() {},
      canPip: false,
      destroy() { destroyed = true; stopPoll(); try { if (yt && yt.destroy) yt.destroy(); } catch (e) { /* */ } holder.remove(); }
    };
  }

  /* ============================= INTERFAZ ============================== */
  const I = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5l10 7-10 7zM17 5h2.5v14H17z"/></svg>',
    back10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">10</text></svg>',
    fwd10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none">10</text></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor"/></svg>',
    fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    fsExit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
    replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/></svg>'
  };

  class FtvPlayer {
    static mount(container, opts) {
      if (container._ftv) { container._ftv.load(opts); return container._ftv; }
      const p = new FtvPlayer(container, opts);
      container._ftv = p;
      return p;
    }

    constructor(container, opts) {
      this.container = container;
      // Modo TV: sin atajos de teclado propios (los maneja tv/js/tv.js con el
      // control remoto), sin botones en la barra y con los botones flotantes
      // (saltar intro, siguiente, etc.) enfocables con las flechas.
      this.tv = !!(opts && opts.tv);
      this.prefs = Object.assign({ vol: 1, muted: false, autoNext: true }, readJSON(LS_PREFS, {}));
      this.adapter = null;
      this.opts = {};
      this.loadToken = 0;
      this.idleTimer = null;
      this.saveTimer = null;
      this.nextTimer = null;
      this.clickTimer = null;
      this.lastPointer = "mouse";
      this.dragging = false;
      this.destroyed = false;
      this.pendingResume = null;

      this._buildDom();
      if (this.tv) this._markTv();
      this._bindUi();
      this._bindGlobal();
      this.load(opts);
    }

    /* --------------------------- DOM --------------------------- */
    _buildDom() {
      this.container.innerHTML = "";
      const root = document.createElement("div");
      root.className = "ftvp is-paused is-idle-ui";
      root.tabIndex = 0;
      root.innerHTML = `
        <div class="ftvp-stage"></div>
        <div class="ftvp-click"></div>
        <img class="ftvp-logo" alt="FicticionalTV" draggable="false">
        <div class="ftvp-spinner" aria-hidden="true"></div>
        <button class="ftvp-bigplay" type="button" aria-label="Reproducir">${I.play}</button>
        <div class="ftvp-toast" role="status"></div>
        <button class="ftvp-skip" type="button">Saltar intro ${I.next}</button>
        <div class="ftvp-next" hidden>
          <span class="ftvp-next-kicker">Siguiente episodio</span>
          <strong class="ftvp-next-title"></strong>
          <span class="ftvp-next-count"></span>
          <div class="ftvp-next-actions">
            <button type="button" class="ftvp-btn-primary" data-act="next-now">Reproducir ahora</button>
            <button type="button" class="ftvp-btn-ghost" data-act="next-cancel">Cancelar</button>
          </div>
        </div>
        <div class="ftvp-end" hidden>
          <button type="button" class="ftvp-btn-primary" data-act="replay">${I.replay}<span>Ver de nuevo</span></button>
        </div>
        <div class="ftvp-error" hidden>
          <p>No se pudo reproducir este video.</p>
          <div class="ftvp-next-actions">
            <button type="button" class="ftvp-btn-primary" data-act="retry">Reintentar</button>
            <a class="ftvp-btn-ghost" data-ref="ext" target="_blank" rel="noopener" hidden>Abrir en otra pestaña</a>
          </div>
        </div>
        <div class="ftvp-shade"></div>
        <div class="ftvp-controls">
          <div class="ftvp-seek" aria-label="Barra de progreso">
            <div class="ftvp-seek-track"><div class="ftvp-buf"></div><div class="ftvp-prog"></div></div>
            <div class="ftvp-knob"></div>
            <div class="ftvp-tip">0:00</div>
          </div>
          <div class="ftvp-row">
            <button class="ftvp-ic" data-act="toggle" aria-label="Reproducir o pausar"><span class="ftvp-i-play">${I.play}</span><span class="ftvp-i-pause">${I.pause}</span></button>
            <button class="ftvp-ic ftvp-hide-sm" data-act="back" aria-label="Retroceder 10 segundos">${I.back10}</button>
            <button class="ftvp-ic ftvp-hide-sm" data-act="fwd" aria-label="Adelantar 10 segundos">${I.fwd10}</button>
            <button class="ftvp-ic" data-act="nextep" aria-label="Siguiente episodio" hidden>${I.next}</button>
            <div class="ftvp-vol">
              <button class="ftvp-ic" data-act="mute" aria-label="Silenciar"><span class="ftvp-i-vol">${I.vol}</span><span class="ftvp-i-mute">${I.mute}</span></button>
              <input class="ftvp-vol-range" type="range" min="0" max="1" step="0.02" value="1" aria-label="Volumen">
            </div>
            <span class="ftvp-time"><span class="ftvp-cur">0:00</span><span class="ftvp-sep"> / </span><span class="ftvp-dur">0:00</span></span>
            <span class="ftvp-spacer"></span>
            <button class="ftvp-ic" data-act="settings" aria-label="Ajustes" aria-haspopup="true">${I.gear}</button>
            <button class="ftvp-ic ftvp-hide-sm" data-act="pip" aria-label="Imagen en imagen" hidden>${I.pip}</button>
            <button class="ftvp-ic" data-act="fs" aria-label="Pantalla completa"><span class="ftvp-i-fs">${I.fs}</span><span class="ftvp-i-fsx">${I.fsExit}</span></button>
          </div>
        </div>
        <div class="ftvp-menu" hidden></div>
      `;
      this.container.appendChild(root);
      this.root = root;
      const q = s => root.querySelector(s);
      this.el = {
        stage: q(".ftvp-stage"), click: q(".ftvp-click"), logo: q(".ftvp-logo"), toast: q(".ftvp-toast"),
        skip: q(".ftvp-skip"), nextBox: q(".ftvp-next"), nextTitle: q(".ftvp-next-title"), nextCount: q(".ftvp-next-count"),
        end: q(".ftvp-end"), error: q(".ftvp-error"), errorExt: q("[data-ref=ext]"),
        seek: q(".ftvp-seek"), buf: q(".ftvp-buf"), prog: q(".ftvp-prog"), knob: q(".ftvp-knob"), tip: q(".ftvp-tip"),
        cur: q(".ftvp-cur"), dur: q(".ftvp-dur"), volRange: q(".ftvp-vol-range"),
        nextBtn: q('[data-act="nextep"]'), pipBtn: q('[data-act="pip"]'), menu: q(".ftvp-menu"), bigplay: q(".ftvp-bigplay")
      };
    }

    _bindUi() {
      const r = this.root, e = this.el;

      r.addEventListener("click", ev => {
        const btn = ev.target.closest("[data-act]");
        if (btn) { this._action(btn.dataset.act, ev); return; }
        if (e.menu.contains(ev.target)) return;
        if (!e.menu.hidden && !ev.target.closest(".ftvp-controls")) this._closeMenu();
      });
      e.bigplay.addEventListener("click", () => this.toggle());
      e.skip.addEventListener("click", () => this.skipIntro());

      // Click sobre el video: pausa/reproduce (con retardo para distinguir el doble click)
      r.addEventListener("pointerdown", ev => { this.lastPointer = ev.pointerType || "mouse"; });
      e.click.addEventListener("click", ev => {
        if (!e.menu.hidden) { this._closeMenu(); return; }
        const touch = this.lastPointer === "touch";
        if (touch && this.root.classList.contains("is-idle-ui")) { this._wake(); return; }
        clearTimeout(this.clickTimer);
        this.clickTimer = setTimeout(() => this.toggle(), 230);
      });
      e.click.addEventListener("dblclick", ev => {
        clearTimeout(this.clickTimer);
        const rect = e.click.getBoundingClientRect();
        const x = (ev.clientX - rect.left) / rect.width;
        if (this.lastPointer === "touch") {
          if (x < 0.35) this.seekBy(-10); else if (x > 0.65) this.seekBy(10); else this.toggleFullscreen();
        } else {
          this.toggleFullscreen();
        }
      });

      // Mostrar / ocultar controles
      ["mousemove", "pointermove", "touchstart", "keydown", "focusin"].forEach(n => r.addEventListener(n, () => this._wake(), { passive: true }));
      r.addEventListener("mouseleave", () => { if (!this.adapter || !this.adapter.paused()) this._sleep(); });

      // Volumen
      e.volRange.addEventListener("input", () => {
        if (!this.adapter) return;
        const v = parseFloat(e.volRange.value);
        this.adapter.volume(v);
        this.adapter.muted(v === 0);
        this._savePrefs();
      });

      // Barra de progreso
      const seekAt = ev => {
        const rect = e.seek.getBoundingClientRect();
        return clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      };
      e.seek.addEventListener("pointerdown", ev => {
        if (!this.adapter || !this.adapter.duration()) return;
        this.dragging = true;
        e.seek.setPointerCapture(ev.pointerId);
        const f = seekAt(ev);
        this._paintProgress(f * this.adapter.duration());
        this._dragFrac = f;
      });
      e.seek.addEventListener("pointermove", ev => {
        if (!this.adapter) return;
        const d = this.adapter.duration();
        if (!d) return;
        const f = seekAt(ev);
        e.tip.textContent = fmtTime(f * d);
        e.tip.style.left = (f * 100) + "%";
        if (this.dragging) { this._dragFrac = f; this._paintProgress(f * d); }
      });
      const endDrag = ev => {
        if (!this.dragging) return;
        this.dragging = false;
        const d = this.adapter ? this.adapter.duration() : 0;
        if (d) this.adapter.seek((this._dragFrac != null ? this._dragFrac : seekAt(ev)) * d);
      };
      e.seek.addEventListener("pointerup", endDrag);
      e.seek.addEventListener("pointercancel", () => { this.dragging = false; });

      document.addEventListener("fullscreenchange", this._onFs = () => {
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        r.classList.toggle("is-fs", fsEl === r);
      });
      document.addEventListener("webkitfullscreenchange", this._onFs);
    }

    _bindGlobal() {
      this._onKey = ev => this._keydown(ev);
      if (!this.tv) document.addEventListener("keydown", this._onKey);
      this._onHide = () => this._saveProgress();
      window.addEventListener("pagehide", this._onHide);
      document.addEventListener("visibilitychange", () => { if (document.hidden) this._saveProgress(); });
    }

    _markTv() {
      const r = this.root;
      r.classList.add("ftvp-tv", "focusable");
      r.setAttribute("data-fk", "p:surface");
      const mark = (sel, fk) => {
        const b = r.querySelector(sel);
        if (b) { b.classList.add("focusable"); b.setAttribute("data-fk", fk); }
      };
      mark(".ftvp-skip", "p:skip");
      mark('[data-act="next-now"]', "p:next-now");
      mark('[data-act="next-cancel"]', "p:next-cancel");
      mark('[data-act="replay"]', "p:replay");
      mark('[data-act="retry"]', "p:retry");
    }
    /* Pone el foco en el primer botón visible de una capa (modo TV). */
    _focusOverlay(box) {
      if (!this.tv || !box) return;
      const b = box.querySelector("button:not([hidden])");
      if (b) setTimeout(() => { try { b.focus(); } catch (e) { /* */ } }, 0);
    }
    wake() { this._wake(); }
    cycleRate() {
      if (!this.adapter) return 1;
      const cur = this.adapter.rate();
      let i = RATES.findIndex(r => Math.abs(r - cur) < 0.01);
      i = (i + 1) % RATES.length;
      this.adapter.rate(RATES[i]);
      return RATES[i];
    }
    cycleQuality() {
      if (!this.adapter) return null;
      const list = this.adapter.qualities();
      if (list.length < 2) return null;
      const i = (this.adapter.quality() + 1) % list.length;
      this.adapter.setQuality(i);
      return list[i];
    }

    /* -------------------- carga de una fuente -------------------- */
    setOptions(patch) {
      Object.assign(this.opts, patch || {});
      this._refreshNextUi();
      this._updateSkip();
    }

    async load(opts) {
      const token = ++this.loadToken;
      this._saveProgress();
      this._teardownAdapter();
      this._hideOverlays();

      this.opts = Object.assign({
        src: "", title: "", logo: LOGO_DEFAULT, resumeKey: "", introStart: null, introEnd: null,
        next: null, autoplay: false
      }, opts || {});
      const o = this.opts;
      this.el.logo.src = o.logo || LOGO_DEFAULT;
      this.el.logo.style.display = o.logo === false ? "none" : "";
      this._refreshNextUi();

      const root = this.root;
      root.classList.remove("is-iframe", "is-error", "has-ended");
      root.classList.add("is-loading");

      if (!o.src) { this._showError("Este episodio todavía no tiene un reproductor configurado."); return; }

      let info = detectSource(o.src);
      this.srcInfo = info;

      if (info.type === "archive") {
        try {
          const r = await resolveArchive(info.id);
          if (token !== this.loadToken) return;
          info = { type: "file", qualities: r.qualities, start: r.start, url: r.qualities[r.start].url };
        } catch (err) {
          if (token !== this.loadToken) return;
          console.warn("FicticionalTV: no se pudo leer el item de Archive.org, se usa su reproductor.", err);
          info = { type: "iframe", url: info.embedUrl };
        }
      }

      if (info.type === "iframe") {
        this._mountIframe(info.url);
        return;
      }

      const stage = this.el.stage;
      let ad;
      try {
        ad = info.type === "youtube" ? youtubeAdapter(stage, info, { autoplay: o.autoplay }) : fileAdapter(stage, info);
      } catch (err) { this._showError(); return; }
      this.adapter = ad;
      root.classList.remove("is-loading");
      root.classList.toggle("is-yt", info.type === "youtube");

      // Preferencias guardadas
      // En TV el volumen lo controla el control remoto: siempre con sonido.
      ad.volume(this.tv ? 1 : this.prefs.vol);
      ad.muted(this.tv ? false : this.prefs.muted);
      this.el.volRange.value = this.tv ? 1 : (this.prefs.muted ? 0 : this.prefs.vol);
      this.el.pipBtn.hidden = !ad.canPip;

      ad.on("play", () => { root.classList.remove("is-paused", "has-ended"); root.classList.add("is-playing"); this._hideEnd(); this._wake(); });
      ad.on("pause", () => { root.classList.remove("is-playing"); root.classList.add("is-paused"); this._wake(); this._saveProgress(); });
      ad.on("waiting", () => root.classList.add("is-waiting"));
      ad.on("playing", () => root.classList.remove("is-waiting", "is-loading"));
      ad.on("time", () => this._tick());
      ad.on("progress", () => this._paintBuffer());
      ad.on("meta", () => { this._tick(); this._maybeResume(); });
      ad.on("volume", () => this._paintVolume());
      ad.on("rate", () => this._renderMenu());
      ad.on("qualities", () => this._renderMenu());
      ad.on("ended", () => this._onEnded());
      ad.on("error", err => { console.warn("FicticionalTV player:", err); this._showError(); });

      // Reanudar donde se quedó
      this.pendingResume = null;
      if (o.resumeKey) {
        const saved = readJSON(LS_PROGRESS, {})[o.resumeKey];
        if (saved && saved.t > 10) this.pendingResume = saved.t;
      }

      this._paintVolume();
      this._tick();
      this._renderMenu();

      if (o.autoplay) {
        const p = ad.play();
        if (p && p.catch) p.catch(() => {
          // El navegador bloqueó el autoplay con sonido: probamos en silencio
          ad.muted(true);
          const p2 = ad.play();
          if (p2 && p2.catch) p2.catch(() => {});
          this._toast("Toca el volumen para activar el sonido");
        });
      }

      clearInterval(this.saveTimer);
      this.saveTimer = setInterval(() => { if (this.adapter && !this.adapter.paused()) this._saveProgress(); }, 5000);
    }

    _mountIframe(url) {
      const root = this.root;
      root.classList.remove("is-loading");
      root.classList.add("is-iframe");
      const f = document.createElement("iframe");
      f.src = url;
      f.title = this.opts.title || "Reproductor";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      f.setAttribute("allowfullscreen", "");
      this.el.stage.appendChild(f);
      this._iframe = f;
    }

    _teardownAdapter() {
      clearInterval(this.saveTimer);
      clearInterval(this.nextTimer);
      if (this.adapter) { try { this.adapter.destroy(); } catch (e) { /* */ } this.adapter = null; }
      if (this._iframe) { this._iframe.remove(); this._iframe = null; }
      this.el.stage.innerHTML = "";
      this.root.classList.remove("is-playing", "is-waiting", "is-yt");
      this.root.classList.add("is-paused");
      this.el.prog.style.transform = "scaleX(0)";
      this.el.buf.style.transform = "scaleX(0)";
      this.el.knob.style.left = "0%";
      this.el.cur.textContent = "0:00";
      this.el.dur.textContent = "0:00";
      this._closeMenu();
    }

    destroy() {
      this.destroyed = true;
      this._saveProgress();
      this._teardownAdapter();
      document.removeEventListener("keydown", this._onKey);
      window.removeEventListener("pagehide", this._onHide);
      document.removeEventListener("fullscreenchange", this._onFs);
      document.removeEventListener("webkitfullscreenchange", this._onFs);
      this.container._ftv = null;
      this.container.innerHTML = "";
    }

    /* ----------------------- controles básicos ----------------------- */
    toggle() {
      if (!this.adapter) return;
      if (this.adapter.paused()) {
        if (this.root.classList.contains("has-ended")) this.replay();
        else { const p = this.adapter.play(); if (p && p.catch) p.catch(() => {}); }
      } else this.adapter.pause();
    }
    seekBy(delta) {
      if (!this.adapter) return;
      const d = this.adapter.duration();
      const t = clamp(this.adapter.time() + delta, 0, d || Infinity);
      this.adapter.seek(t);
      this._toast((delta > 0 ? "+" : "−") + Math.abs(delta) + " s");
      this._tick();
    }
    replay() {
      if (!this.adapter) return;
      this._hideEnd();
      this.root.classList.remove("has-ended");
      this.adapter.seek(0);
      const p = this.adapter.play(); if (p && p.catch) p.catch(() => {});
    }
    skipIntro() {
      const o = this.opts;
      if (!this.adapter || !(o.introEnd > 0)) return;
      this.adapter.seek(o.introEnd);
      this._toast("Intro saltada");
      this._tick();
    }
    toggleFullscreen() {
      const r = this.root;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (r.requestFullscreen) r.requestFullscreen().catch(() => {});
      else if (r.webkitRequestFullscreen) r.webkitRequestFullscreen();
      else if (this.adapter && this.adapter.el && this.adapter.el.webkitEnterFullscreen) this.adapter.el.webkitEnterFullscreen();
    }
    _setVolume(v) {
      if (!this.adapter) return;
      v = clamp(v, 0, 1);
      this.adapter.volume(v); this.adapter.muted(v === 0);
      this.el.volRange.value = v;
      this._savePrefs();
      this._toast("Volumen " + Math.round(v * 100) + "%");
    }
    _toggleMute() {
      if (!this.adapter) return;
      const m = !this.adapter.muted();
      this.adapter.muted(m);
      if (!m && this.adapter.volume() === 0) this.adapter.volume(0.6);
      this._savePrefs();
    }

    _action(act, ev) {
      switch (act) {
        case "toggle": this.toggle(); break;
        case "back": this.seekBy(-10); break;
        case "fwd": this.seekBy(10); break;
        case "mute": this._toggleMute(); break;
        case "fs": this.toggleFullscreen(); break;
        case "pip": if (this.adapter && this.adapter.pip) { const p = this.adapter.pip(); if (p && p.catch) p.catch(() => {}); } break;
        case "settings": this._toggleMenu(); break;
        case "nextep": case "next-now": this._goNext(); break;
        case "next-cancel": this._cancelNext(); break;
        case "replay": this.replay(); break;
        case "retry": this.load(this.opts); break;
        default: break;
      }
    }

    /* ------------------------- atajos de teclado ------------------------- */
    _keydown(ev) {
      if (this.destroyed || !this.root.isConnected) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.classList.contains("ftvp-vol-range") || t.isContentEditable)) return;
      if (!this.adapter) return;
      const k = ev.key;
      const inPlayer = this.root.contains(document.activeElement) || document.activeElement === document.body;
      const handled = (fn) => { ev.preventDefault(); fn(); this._wake(); };

      switch (k) {
        case " ": case "k": case "K":
          if (!inPlayer) return;
          if (k === " " && t && t.tagName === "BUTTON") return; // dejamos que el botón enfocado haga su acción
          return handled(() => this.toggle());
        case "ArrowLeft": return handled(() => this.seekBy(-5));
        case "ArrowRight": return handled(() => this.seekBy(5));
        case "j": case "J": return handled(() => this.seekBy(-10));
        case "l": case "L": return handled(() => this.seekBy(10));
        case "ArrowUp": return handled(() => this._setVolume(this.adapter.volume() + 0.05));
        case "ArrowDown": return handled(() => this._setVolume(this.adapter.volume() - 0.05));
        case "m": case "M": return handled(() => { this._toggleMute(); this._toast(this.adapter.muted() ? "Silenciado" : "Sonido activado"); });
        case "f": case "F": return handled(() => this.toggleFullscreen());
        case "i": case "I": return handled(() => this.skipIntro());
        case "n": case "N": if (this.opts.next) return handled(() => this._goNext()); return;
        case ">": case ".": return handled(() => this._stepRate(1));
        case "<": case ",": return handled(() => this._stepRate(-1));
        case "Escape": if (!this.el.menu.hidden) return handled(() => this._closeMenu()); return;
        default:
          if (/^[0-9]$/.test(k)) {
            const d = this.adapter.duration();
            if (d) return handled(() => { this.adapter.seek(d * Number(k) / 10); this._tick(); });
          }
      }
    }
    _stepRate(dir) {
      const cur = this.adapter.rate();
      let i = RATES.findIndex(r => Math.abs(r - cur) < 0.01);
      if (i < 0) i = RATES.indexOf(1);
      i = clamp(i + dir, 0, RATES.length - 1);
      this.adapter.rate(RATES[i]);
      this._toast("Velocidad " + RATES[i] + "×");
    }

    /* --------------------------- pintado --------------------------- */
    _tick() {
      const ad = this.adapter; if (!ad) return;
      const t = ad.time(), d = ad.duration();
      if (!this.dragging) this._paintProgress(t);
      this.el.cur.textContent = fmtTime(t);
      this.el.dur.textContent = fmtTime(d);
      this._paintBuffer();
      this._updateSkip();
    }
    _paintProgress(t) {
      const d = this.adapter ? this.adapter.duration() : 0;
      const f = d ? clamp(t / d, 0, 1) : 0;
      this.el.prog.style.transform = `scaleX(${f})`;
      this.el.knob.style.left = (f * 100) + "%";
      if (this.dragging) this.el.cur.textContent = fmtTime(t);
    }
    _paintBuffer() {
      const ad = this.adapter; if (!ad) return;
      const d = ad.duration();
      this.el.buf.style.transform = `scaleX(${d ? clamp(ad.buffered() / d, 0, 1) : 0})`;
    }
    _paintVolume() {
      const ad = this.adapter; if (!ad) return;
      const muted = ad.muted() || ad.volume() === 0;
      this.root.classList.toggle("is-muted", muted);
      this.el.volRange.value = muted ? 0 : ad.volume();
      this.el.volRange.style.setProperty("--v", ((muted ? 0 : ad.volume()) * 100) + "%");
    }
    _updateSkip() {
      const o = this.opts, ad = this.adapter;
      let show = false;
      if (ad && o.introEnd > 0 && !this.root.classList.contains("has-ended")) {
        const start = o.introStart > 0 ? o.introStart : 0;
        const t = ad.time();
        show = t >= start && t < o.introEnd - 1;
      }
      this.el.skip.classList.toggle("is-on", show);
    }
    _toast(msg) {
      const t = this.el.toast;
      t.textContent = msg;
      t.classList.add("is-on");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => t.classList.remove("is-on"), 1300);
    }
    _toastAction(msg, label, fn) {
      const t = this.el.toast;
      t.innerHTML = `${esc(msg)} <button type="button">${esc(label)}</button>`;
      t.classList.add("is-on");
      t.querySelector("button").onclick = () => { fn(); t.classList.remove("is-on"); };
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => t.classList.remove("is-on"), 7000);
    }

    _wake() {
      const r = this.root;
      r.classList.remove("is-idle-ui");
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (this.adapter && !this.adapter.paused() && this.el.menu.hidden && !this.dragging) this._sleep();
      }, this.tv ? 4500 : 2800);
    }
    _sleep() { this.root.classList.add("is-idle-ui"); }

    /* --------------------------- ajustes --------------------------- */
    _toggleMenu() {
      if (this.el.menu.hidden) { this._renderMenu(); this.el.menu.hidden = false; }
      else this._closeMenu();
    }
    _closeMenu() { this.el.menu.hidden = true; }
    _renderMenu() {
      const ad = this.adapter, m = this.el.menu;
      if (typeof this.opts.onUi === "function") {
        try { this.opts.onUi({ rate: ad ? ad.rate() : 1, qualities: ad ? ad.qualities() : [], quality: ad ? ad.quality() : 0 }); } catch (e) { /* */ }
      }
      if (!ad) { m.innerHTML = ""; return; }
      const rate = ad.rate();
      const rates = RATES.map(r => `<button type="button" class="ftvp-chip ${Math.abs(r - rate) < 0.01 ? "is-on" : ""}" data-rate="${r}">${r === 1 ? "Normal" : r + "×"}</button>`).join("");
      const ql = ad.qualities();
      const qi = ad.quality();
      const quals = ql.length > 1
        ? `<div class="ftvp-menu-group"><span>Calidad</span><div class="ftvp-chips">${ql.map((q, i) => `<button type="button" class="ftvp-chip ${i === qi ? "is-on" : ""}" data-q="${i}">${esc(q)}</button>`).join("")}</div></div>`
        : "";
      m.innerHTML = `
        <div class="ftvp-menu-group"><span>Velocidad</span><div class="ftvp-chips">${rates}</div></div>
        ${quals}
        ${this.opts.next ? `<label class="ftvp-switch"><input type="checkbox" data-auto ${this.prefs.autoNext ? "checked" : ""}><i></i><span>Reproducir el siguiente automáticamente</span></label>` : ""}
        <p class="ftvp-menu-hint">Atajos: Espacio pausa · ←/→ ±5 s · J/L ±10 s · ↑/↓ volumen · M silencio · F pantalla completa · I saltar intro · N siguiente · &lt; &gt; velocidad</p>
      `;
      m.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => { ad.rate(parseFloat(b.dataset.rate)); }));
      m.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => { ad.setQuality(parseInt(b.dataset.q, 10)); }));
      const auto = m.querySelector("[data-auto]");
      if (auto) auto.addEventListener("change", () => { this.prefs.autoNext = auto.checked; this._savePrefs(); });
    }

    /* --------------------- siguiente episodio --------------------- */
    _refreshNextUi() {
      const n = this.opts.next;
      this.el.nextBtn.hidden = !n;
      if (n) this.el.nextTitle.textContent = n.title || "";
    }
    _onEnded() {
      this.root.classList.add("has-ended");
      this.root.classList.remove("is-playing");
      this.root.classList.add("is-paused");
      this._saveProgress(true);
      this._updateSkip();
      this._wake();
      const n = this.opts.next;
      if (n) {
        this.el.nextBox.hidden = false;
        this._focusOverlay(this.el.nextBox);
        if (this.prefs.autoNext || this.tv) {
          let left = NEXT_COUNTDOWN;
          this.el.nextCount.textContent = `Empieza en ${left} s`;
          clearInterval(this.nextTimer);
          this.nextTimer = setInterval(() => {
            left--;
            if (left <= 0) { clearInterval(this.nextTimer); this._goNext(); }
            else this.el.nextCount.textContent = `Empieza en ${left} s`;
          }, 1000);
        } else {
          this.el.nextCount.textContent = "";
        }
      } else {
        this.el.end.hidden = false;
        this._focusOverlay(this.el.end);
      }
    }
    _cancelNext() {
      clearInterval(this.nextTimer);
      this.el.nextBox.hidden = true;
      this.el.end.hidden = false;
      this._focusOverlay(this.el.end);
    }
    _goNext() {
      clearInterval(this.nextTimer);
      const n = this.opts.next;
      if (!n) return;
      this.el.nextBox.hidden = true;
      if (typeof n.onPlay === "function") n.onPlay();
      else if (n.href) window.location.href = n.href;
    }
    _hideEnd() { this.el.end.hidden = true; this.el.nextBox.hidden = true; clearInterval(this.nextTimer); }
    _hideOverlays() { this._hideEnd(); this.el.error.hidden = true; this.el.skip.classList.remove("is-on"); }

    _showError(msg) {
      this.root.classList.remove("is-loading", "is-waiting");
      this.root.classList.add("is-error");
      this.el.error.hidden = false;
      this._focusOverlay(this.el.error);
      this.el.error.querySelector("p").textContent = msg || "No se pudo reproducir este video.";
      const retry = this.el.error.querySelector('[data-act="retry"]');
      retry.hidden = !this.opts.src;
      const ext = this.el.errorExt;
      if (this.opts.src && /^https?:/i.test(this.opts.src)) { ext.href = this.opts.src; ext.hidden = false; } else ext.hidden = true;
    }

    /* ----------------- reanudar / guardar progreso ----------------- */
    _maybeResume() {
      if (this.pendingResume == null || !this.adapter) return;
      const d = this.adapter.duration();
      if (!d) return;
      const t = this.pendingResume;
      this.pendingResume = null;
      if (t < d - 30) {
        this.adapter.seek(Math.max(0, t - 2));
        this._toastAction(`Retomado en ${fmtTime(t)}`, "Empezar de nuevo", () => { this.adapter.seek(0); });
      }
    }
    _saveProgress(finished) {
      const key = this.opts && this.opts.resumeKey;
      const ad = this.adapter;
      if (!key || !ad) return;
      const d = ad.duration(), t = ad.time();
      if (!d || d < 30) return;
      const map = readJSON(LS_PROGRESS, {});
      if (finished || t > d - 20) delete map[key];
      else if (t > 5) map[key] = { t: Math.floor(t), d: Math.floor(d), ts: Date.now() };
      else return;
      const keys = Object.keys(map);
      if (keys.length > 300) {
        keys.sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0)).slice(0, keys.length - 300).forEach(k => delete map[k]);
      }
      writeJSON(LS_PROGRESS, map);
    }
    _savePrefs() {
      if (this.tv) return;
      if (this.adapter) { this.prefs.vol = this.adapter.volume(); this.prefs.muted = this.adapter.muted(); }
      writeJSON(LS_PREFS, this.prefs);
    }
  }

  window.FtvPlayer = FtvPlayer;
  window.ftvDetectSource = detectSource;
})();
