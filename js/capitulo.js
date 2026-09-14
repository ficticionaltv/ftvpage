/* ============================================================
   FicticionalTV — Página de capítulo (reproductor + navegación)
   Esta misma página sirve dos tipos de contenido, distinguidos por
   los parámetros de la URL:
   - Episodio de anime:      capitulo.html?id=<animeId>&ep=<numero>
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
});

function getChapterParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get("id"),
    ep: Number(params.get("ep")) || 1,
    extraId: params.get("extra"),
    type: params.get("type") === "video" ? "video" : "audio",
    num: Number(params.get("num")) || 1
  };
}

function renderChapter() {
  const { id, ep, extraId, type, num } = getChapterParams();
  if (extraId) {
    renderExtraChapter(extraId, type, num);
  } else {
    renderAnimeChapter(id, ep);
  }
}

/* ------------------------------------------------------------
   Episodio de anime (comportamiento original)
   ------------------------------------------------------------ */
function renderAnimeChapter(id, ep) {
  const anime = getAnimeById(id) || ANIME_LIST[0];
  const episodes = [...anime.episodes].sort((a, b) => a.number - b.number);
  const episode = episodes.find(e => e.number === ep) || episodes[0];

  document.querySelector("#chapter-back-link").href = `anime.html?id=${anime.id}`;
  document.querySelector("#chapter-back-link").textContent = "← Volver a la ficha del anime";

  if (!episode) {
    document.title = `${anime.title} — FicticionalTV`;
    document.querySelector("#chapter-root").innerHTML = `
      <h1 class="chapter-title" style="margin:28px 0 0;">${anime.title}</h1>
      <div class="empty-state">
        Este anime todavía no tiene capítulos cargados.<br>
        <a class="btn btn-primary" style="margin-top:16px;" href="admin.html?id=${anime.id}">Agregar capítulos en el panel</a>
      </div>
    `;
    return;
  }

  document.title = `${anime.title} · Episodio ${episode.number} — FicticionalTV`;

  // Marca este episodio como visto en cuanto se abre su reproductor.
  markWatched(`anime:${anime.id}`, episode.number);

  renderPlayer(anime.title, episode);
  renderHeaderInfo({
    kickerText: anime.title,
    kickerHref: `anime.html?id=${anime.id}`,
    titleText: `E${episode.number} - ${episode.title}`,
    durationText: episode.embedUrl ? episode.duration : "Sin video",
    audioText: audioLabel(anime.audio),
    positionText: `Episodio ${episode.number} de ${episodes.length}`
  });
  renderShareButton({
    url: `${window.location.origin}${window.location.pathname}?id=${anime.id}&ep=${episode.number}`,
    title: `${anime.title} — Episodio ${episode.number}`,
    text: `Mira ${anime.title}, Episodio ${episode.number} en FicticionalTV`
  });
  renderSidebar(episodes, episode, (ep) => ({
    href: `capitulo.html?id=${anime.id}&ep=${ep.number}`,
    label: `E${ep.number} - ${ep.title}`,
    sub: audioLabel(anime.audio),
    watchKey: `anime:${anime.id}`
  }));
}

/* ------------------------------------------------------------
   Ítem de un extra (audio o video)
   ------------------------------------------------------------ */
function renderExtraChapter(extraId, type, num) {
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

  renderPlayer(extra.title, item);
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
function renderPlayer(titleForPlayer, episode) {
  const wrap = document.querySelector("#player-wrap");
  if (episode.embedUrl) {
    // OJO: antes este <iframe> forzaba referrerpolicy="no-referrer". La
    // mayoría de los sitios de video no le dan importancia, pero YouTube
    // sí: necesita recibir el origen/referrer de la página para
    // autorizar la reproducción embebida, y sin él responde con el
    // "Error 153" ("video player configuration error") en vez de
    // reproducir el video. Al quitar el atributo, el navegador usa su
    // política de referrer por defecto (strict-origin-when-cross-origin),
    // que sí manda esa información y funciona igual de bien con
    // cualquier otro proveedor de video.
    wrap.innerHTML = `
      <iframe
        src="${episode.embedUrl}"
        title="Reproductor de ${titleForPlayer} — ${episode.title}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy"></iframe>
    `;
  } else {
    wrap.innerHTML = `
      <div class="no-embed-msg">
        <p>Este episodio todavía no tiene un reproductor configurado.</p>
      </div>
    `;
  }
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
