/* ============================================================
   FicticionalTV — Página de capítulo (reproductor + navegación)
   Esta misma página sirve dos tipos de contenido, distinguidos por
   los parámetros de la URL:
   - Episodio de anime:      capitulo.html?id=<animeId>&season=<temporada>&ep=<numero>
                             (si falta &season se usa la primera temporada)
   - Ítem de un extra:       capitulo.html?extra=<extraId>&type=audio|video&num=<numero>
   El reproductor, la barra lateral y el resto de la interfaz son
   exactamente los mismos en ambos casos; solo cambia de dónde se
   leen los datos y hacia dónde apuntan los enlaces.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ANIME_LIST/EXTRAS_LIST llegan de forma asíncrona desde Firestore, y
  // pueden volver a cambiar mientras esta página sigue abierta (contenido
  // editado o agregado desde el panel). Nos suscribimos a ambos eventos
  // para que el reproductor y la barra lateral siempre reflejen lo
  // último guardado sin necesidad de recargar la página a mano.
  onLibraryReady(() => renderChapter());
  onLibraryChange(() => renderChapter());

  // Botón "atrás" del navegador tras una navegación interna.
  window.addEventListener("popstate", () => renderChapter());

  // Los enlaces de siguiente/anterior cambian de episodio SIN recargar la
  // página: así el reproductor se mantiene (y la pantalla completa también).
  document.addEventListener("click", (e) => {
    const link = e.target.closest && e.target.closest(".chapter-sidebar a.side-ep-card");
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateToChapter(link.getAttribute("href"), true);
  });
});

/* Cambia de capítulo dentro de la misma página (History API). */
let pendingAutoplay = false;
function navigateToChapter(href, autoplay) {
  pendingAutoplay = !!autoplay;
  history.pushState(null, "", href);
  renderChapter();
  const frame = document.querySelector(".chapter-player");
  if (frame && frame.getBoundingClientRect().top < 0) frame.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getChapterParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get("id"),
    season: Number(params.get("season")) || null,
    ep: Number(params.get("ep")) || 1,
    autoplay: params.get("autoplay") === "1",
    extraId: params.get("extra"),
    type: params.get("type") === "video" ? "video" : "audio",
    num: Number(params.get("num")) || 1
  };
}

function renderChapter() {
  const { id, season, ep, extraId, type, num, autoplay } = getChapterParams();
  const wantAutoplay = pendingAutoplay || autoplay;
  pendingAutoplay = false;
  if (extraId) {
    renderExtraChapter(extraId, type, num, wantAutoplay);
  } else {
    renderAnimeChapter(id, ep, season, wantAutoplay);
  }
}

/* ------------------------------------------------------------
   Episodio de anime (comportamiento original)
   ------------------------------------------------------------ */
function renderAnimeChapter(id, ep, seasonNumber, autoplay) {
  const anime = getAnimeById(id) || getVisibleAnimes()[0] || ANIME_LIST[0];
  const season = getSeason(anime, seasonNumber);
  const episodes = [...season.episodes].sort((a, b) => a.number - b.number);
  const episode = episodes.find(e => e.number === ep) || episodes[0];
  const multiSeason = anime.seasons.length > 1;
  const isFirstSeason = season.number === anime.seasons[0].number;
  // La primera temporada conserva la clave de "visto" de siempre, para no
  // perder el progreso que ya tenía la gente; las demás llevan su propia clave.
  const watchKey = isFirstSeason ? `anime:${anime.id}` : `anime:${anime.id}:s${season.number}`;
  const seasonQuery = `season=${season.number}`;
  const seasonTag = multiSeason ? `T${season.number} ` : "";

  document.querySelector("#chapter-back-link").href = `anime.html?id=${anime.id}&${seasonQuery}`;
  document.querySelector("#chapter-back-link").textContent = "← Volver a la ficha del anime";

  if (!episode) {
    document.title = `${anime.title} — FicticionalTV`;
    document.querySelector("#chapter-root").innerHTML = `
      <h1 class="chapter-title" style="margin:28px 0 0;">${anime.title}</h1>
      <div class="empty-state">
        ${multiSeason ? "Esta temporada" : "Este anime"} todavía no tiene capítulos cargados.<br>
        <a class="btn btn-primary" style="margin-top:16px;" href="admin.html?id=${anime.id}">Agregar capítulos en el panel</a>
      </div>
    `;
    return;
  }

  const where = multiSeason ? `Temporada ${season.number} · Episodio ${episode.number}` : `Episodio ${episode.number}`;
  document.title = `${anime.title} · ${where} — FicticionalTV`;

  // Marca este episodio como visto en cuanto se abre su reproductor.
  markWatched(watchKey, episode.number);

  // Siguiente episodio: el de esta temporada o, si era el último, el primero
  // de la temporada siguiente.
  let nextEp = episodes[episodes.findIndex(e => e.number === episode.number) + 1];
  let nextSeason = season;
  if (!nextEp) {
    const later = anime.seasons.filter(s => s.number > season.number && s.episodes.length).sort((a, b) => a.number - b.number)[0];
    if (later) {
      nextSeason = later;
      nextEp = [...later.episodes].sort((a, b) => a.number - b.number)[0];
    }
  }
  const nextTag = anime.seasons.length > 1 ? `T${nextSeason.number} ` : "";
  const nextHref = nextEp ? `capitulo.html?id=${anime.id}&season=${nextSeason.number}&ep=${nextEp.number}` : null;

  renderPlayer(anime.title, episode, {
    resumeKey: `${watchKey}:${episode.number}`,
    autoplay,
    next: nextEp ? {
      title: `${nextTag}E${nextEp.number} - ${nextEp.title}`,
      onPlay: () => navigateToChapter(nextHref, true)
    } : null
  });
  renderHeaderInfo({
    kickerText: multiSeason ? `${anime.title} · ${seasonLabel(season)}` : anime.title,
    kickerHref: `anime.html?id=${anime.id}&${seasonQuery}`,
    titleText: `${seasonTag}E${episode.number} - ${episode.title}`,
    durationText: episode.embedUrl ? episode.duration : "Sin video",
    audioText: audioLabel(anime.audio),
    positionText: `Episodio ${episode.number} de ${episodes.length}`
  });
  renderShareButton({
    url: `${window.location.origin}${window.location.pathname}?id=${anime.id}&${seasonQuery}&ep=${episode.number}`,
    title: `${anime.title} — ${where}`,
    text: `Mira ${anime.title}, ${where} en FicticionalTV`
  });
  renderSidebar(episodes, episode, (ep) => ({
    href: `capitulo.html?id=${anime.id}&${seasonQuery}&ep=${ep.number}`,
    label: `${seasonTag}E${ep.number} - ${ep.title}`,
    sub: audioLabel(anime.audio),
    watchKey
  }));
}

/* ------------------------------------------------------------
   Ítem de un extra (audio o video)
   ------------------------------------------------------------ */
function renderExtraChapter(extraId, type, num, autoplay) {
  const extra = getExtraById(extraId) || EXTRAS_LIST[0];
  if (!extra) {
    document.title = "FicticionalTV";
    document.querySelector("#chapter-root").innerHTML = `
      <div class="empty-state">
        Todavía no hay extras cargados.<br>
        <a class="btn btn-primary" style="margin-top:16px;" href="admin.html">Agregar extras en el panel</a>
      </div>
    `;
    return;
  }

  const items = [...(type === "video" ? extra.video : extra.audio)].sort((a, b) => a.number - b.number);
  const item = items.find(i => i.number === num) || items[0];
  const kindLabel = type === "video" ? "Video" : "Audio";
  const kindLetter = type === "video" ? "V" : "A";

  document.querySelector("#chapter-back-link").href = `extra.html?id=${extra.id}`;
  document.querySelector("#chapter-back-link").textContent = "← Volver a la ficha del extra";

  if (!item) {
    document.title = `${extra.title} — FicticionalTV`;
    document.querySelector("#chapter-root").innerHTML = `
      <h1 class="chapter-title" style="margin:28px 0 0;">${extra.title}</h1>
      <div class="empty-state">
        Este extra todavía no tiene contenido de ${kindLabel.toLowerCase()} cargado.<br>
        <a class="btn btn-primary" style="margin-top:16px;" href="admin.html">Agregar contenido en el panel</a>
      </div>
    `;
    return;
  }

  document.title = `${extra.title} · ${kindLabel} ${item.number} — FicticionalTV`;

  markWatched(`extra:${extra.id}:${type}`, item.number);

  const nextItem = items[items.findIndex(i => i.number === item.number) + 1];
  renderPlayer(extra.title, item, {
    resumeKey: `extra:${extra.id}:${type}:${item.number}`,
    autoplay,
    next: nextItem ? {
      title: `${kindLetter}${nextItem.number} - ${nextItem.title}`,
      onPlay: () => navigateToChapter(`capitulo.html?extra=${extra.id}&type=${type}&num=${nextItem.number}`, true)
    } : null
  });
  renderHeaderInfo({
    kickerText: extra.title,
    kickerHref: `extra.html?id=${extra.id}`,
    titleText: `${kindLetter}${item.number} - ${item.title}`,
    durationText: item.embedUrl ? item.duration : "Sin video",
    audioText: kindLabel,
    positionText: `${kindLabel} ${item.number} de ${items.length}`
  });
  renderShareButton({
    url: `${window.location.origin}${window.location.pathname}?extra=${extra.id}&type=${type}&num=${item.number}`,
    title: `${extra.title} — ${kindLabel} ${item.number}`,
    text: `Mira ${extra.title}, ${kindLabel} ${item.number} en FicticionalTV`
  });
  renderSidebar(items, item, (i) => ({
    href: `capitulo.html?extra=${extra.id}&type=${type}&num=${i.number}`,
    label: `${kindLetter}${i.number} - ${i.title}`,
    sub: kindLabel,
    watchKey: `extra:${extra.id}:${type}`
  }));
}

/* ------------------------------------------------------------
   Piezas compartidas por ambos tipos de contenido
   ------------------------------------------------------------ */
function renderPlayer(titleForPlayer, episode, extra = {}) {
  const wrap = document.querySelector("#player-wrap");

  if (!episode.embedUrl) {
    if (wrap._ftv) wrap._ftv.destroy();
    delete wrap.dataset.key;
    wrap.innerHTML = `
      <div class="no-embed-msg">
        <p>Este episodio todavía no tiene un reproductor configurado.</p>
      </div>
    `;
    return;
  }

  // Reproductor propio (js/player.js): reproduce archivos directos, Archive.org,
  // HLS y YouTube con interfaz de FicticionalTV; cualquier otro embed se
  // muestra en un iframe con el logo encima.
  //
  // renderChapter() también se ejecuta cada vez que Firestore avisa de un
  // cambio. Si seguimos en el mismo video no lo reiniciamos (cortaría la
  // reproducción): solo actualizamos intro y siguiente episodio.
  const key = `${extra.resumeKey || ""}|${episode.embedUrl}`;
  const introStart = Number.isFinite(episode.introStart) ? episode.introStart : null;
  const introEnd = Number.isFinite(episode.introEnd) ? episode.introEnd : null;

  if (wrap._ftv && wrap.dataset.key === key) {
    wrap._ftv.setOptions({ introStart, introEnd, next: extra.next || null });
    return;
  }
  wrap.dataset.key = key;
  FtvPlayer.mount(wrap, {
    src: episode.embedUrl,
    title: `${titleForPlayer} — ${episode.title}`,
    resumeKey: extra.resumeKey || "",
    introStart, introEnd,
    next: extra.next || null,
    autoplay: !!extra.autoplay
  });
}

/* Kicker, título, y fila de meta (duración · audio/tipo · posición). */
function renderHeaderInfo({ kickerText, kickerHref, titleText, durationText, audioText, positionText }) {
  const kicker = document.querySelector("#chapter-kicker");
  kicker.textContent = kickerText;
  kicker.href = kickerHref;

  document.querySelector("#chapter-title").textContent = titleText;

  document.querySelector("#chapter-duration-chip").textContent = durationText;
  document.querySelector("#chapter-audio-text").textContent = audioText;
  document.querySelector("#chapter-position-text").textContent = positionText;
}

function audioLabel(audio) {
  return audio && audio.trim() ? audio.trim() : "Español Latino";
}

/* Botón de compartir. */
function renderShareButton({ url, title, text }) {
  const shareBtn = document.querySelector("#chapter-share-btn");
  if (!shareBtn) return;
  shareBtn.onclick = () => shareContent({ url, title, text }, shareBtn);
}

async function shareContent(shareData, btn) {
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (err) { /* el usuario canceló el share, no hacemos nada */ }
    return;
  }
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(shareData.url);
      const label = btn.querySelector("#chapter-share-label");
      btn.classList.add("is-copied");
      if (label) label.textContent = "¡Enlace copiado!";
      setTimeout(() => {
        btn.classList.remove("is-copied");
        if (label) label.textContent = "Compartir";
      }, 1800);
    } catch (err) { /* clipboard no disponible, ignoramos silenciosamente */ }
  }
}

/* Tarjetas de "siguiente" / "anterior" en la barra lateral, con
   indicador de "Visto" para los ya reproducidos en este navegador.
   `list` y `current` son genéricos (episodios de anime o ítems de un
   extra); `linkBuilder(item)` decide hacia dónde apunta cada tarjeta. */
function renderSidebar(list, current, linkBuilder) {
  const idx = list.findIndex(e => e.number === current.number);
  const prev = list[idx - 1];
  const next = list[idx + 1];

  const nextGroup = document.querySelector("#side-next-group");
  const prevGroup = document.querySelector("#side-prev-group");

  if (next) {
    nextGroup.style.display = "";
    const info = linkBuilder(next);
    document.querySelector("#side-next").innerHTML = sideCard(next, info, getWatchedSet(info.watchKey).has(next.number));
  } else {
    nextGroup.style.display = "none";
  }

  if (prev) {
    prevGroup.style.display = "";
    const info = linkBuilder(prev);
    document.querySelector("#side-prev").innerHTML = sideCard(prev, info, getWatchedSet(info.watchKey).has(prev.number));
  } else {
    prevGroup.style.display = "none";
  }
}

function sideCard(item, info, isWatched) {
  return `
    <a class="side-ep-card" href="${info.href}">
      <div class="side-ep-thumb">
        <img src="${item.thumb}" alt="Miniatura" loading="lazy">
        ${isWatched
          ? `<span class="side-ep-replay">${replayIconSvg()}</span><span class="side-ep-watched">Visto</span>`
          : `<span class="side-ep-play">${playIconSvg()}</span>`}
      </div>
      <div class="side-ep-body">
        <h3>${info.label}</h3>
        <span>${info.sub}</span>
      </div>
    </a>
  `;
}

/* ------------------------------------------------------------
   Íconos (SVG en línea, heredan color con currentColor)
   ------------------------------------------------------------ */
function replayIconSvg() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 1 1.8 4.07"/><path d="M2.4 3.8v3.5h3.5"/></svg>`;
}

/* ------------------------------------------------------------
   Almacenamiento local (por navegador): contenido ya visto.
   La clave (`key`) identifica de forma única al anime o al par
   extra+tipo (por ejemplo "anime:shadow-blade-chronicles" o
   "extra:mi-extra:video"), para no mezclar el progreso de un
   episodio de anime con el de un extra.
   ------------------------------------------------------------ */
const CH_KEYS = {
  watched: "ftv_watched_episodes"
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* localStorage no disponible, seguimos sin persistir */ }
}

function getWatchedSet(key) {
  const map = readJSON(CH_KEYS.watched, {});
  return new Set(map[key] || []);
}
function markWatched(key, number) {
  const map = readJSON(CH_KEYS.watched, {});
  const set = new Set(map[key] || []);
  set.add(number);
  map[key] = [...set];
  writeJSON(CH_KEYS.watched, map);
}
