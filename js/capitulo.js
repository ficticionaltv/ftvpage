/* ============================================================
   FicticionalTV — Página de capítulo (reproductor + navegación)
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ANIME_LIST llega de forma asíncrona desde Firestore, y puede volver
  // a cambiar mientras esta página sigue abierta (capítulo editado o
  // agregado desde el panel). Nos suscribimos a ambos eventos para que
  // el reproductor y la barra lateral siempre reflejen lo último
  // guardado sin necesidad de recargar la página a mano.
  onLibraryReady(() => renderChapter());
  onLibraryChange(() => renderChapter());
});

function getChapterParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get("id"),
    ep: Number(params.get("ep")) || 1
  };
}

function renderChapter() {
  const { id, ep } = getChapterParams();
  const anime = getAnimeById(id) || ANIME_LIST[0];
  const episodes = [...anime.episodes].sort((a, b) => a.number - b.number);
  const episode = episodes.find(e => e.number === ep) || episodes[0];

  document.querySelector("#chapter-back-link").href = `anime.html?id=${anime.id}`;

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
  markWatched(anime.id, episode.number);

  renderPlayer(anime, episode);
  renderHeaderInfo(anime, episode, episodes);
  renderShareButton(anime, episode);
  renderSidebar(anime, episodes, episode);
}

function renderPlayer(anime, episode) {
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
        title="Reproductor de ${anime.title} — Episodio ${episode.number}"
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

/* Kicker (anime), botón de guardar, título del episodio y fila de meta
   (duración · audio · posición dentro de la temporada). */
function renderHeaderInfo(anime, episode, episodes) {
  const kicker = document.querySelector("#chapter-kicker");
  kicker.textContent = anime.title;
  kicker.href = `anime.html?id=${anime.id}`;

  document.querySelector("#chapter-title").textContent = `E${episode.number} - ${episode.title}`;

  document.querySelector("#chapter-duration-chip").textContent = episode.embedUrl ? episode.duration : "Sin video";
  document.querySelector("#chapter-audio-text").textContent = audioLabel(anime.audio);
  document.querySelector("#chapter-position-text").textContent = `Episodio ${episode.number} de ${episodes.length}`;
}

function audioLabel(audio) {
  return audio && audio.trim() ? audio.trim() : "Español Latino";
}

/* Botón de compartir episodio. */
function renderShareButton(anime, episode) {
  const shareBtn = document.querySelector("#chapter-share-btn");
  if (!shareBtn) return;
  shareBtn.onclick = () => shareEpisode(anime, episode, shareBtn);
}

async function shareEpisode(anime, episode, btn) {
  const url = `${window.location.origin}${window.location.pathname}?id=${anime.id}&ep=${episode.number}`;
  const shareData = {
    title: `${anime.title} — Episodio ${episode.number}`,
    text: `Mira ${anime.title}, Episodio ${episode.number} en FicticionalTV`,
    url
  };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (err) { /* el usuario canceló el share, no hacemos nada */ }
    return;
  }
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
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

/* Tarjetas de "siguiente episodio" / "episodio anterior" en la barra
   lateral, con indicador de "Visto" para los capítulos ya reproducidos
   en este navegador. */
function renderSidebar(anime, episodes, episode) {
  const idx = episodes.findIndex(e => e.number === episode.number);
  const prev = episodes[idx - 1];
  const next = episodes[idx + 1];
  const watched = getWatchedSet(anime.id);

  const nextGroup = document.querySelector("#side-next-group");
  const prevGroup = document.querySelector("#side-prev-group");

  if (next) {
    nextGroup.style.display = "";
    document.querySelector("#side-next").innerHTML = sideEpisodeCard(anime, next, watched.has(next.number));
  } else {
    nextGroup.style.display = "none";
  }

  if (prev) {
    prevGroup.style.display = "";
    document.querySelector("#side-prev").innerHTML = sideEpisodeCard(anime, prev, watched.has(prev.number));
  } else {
    prevGroup.style.display = "none";
  }
}

function sideEpisodeCard(anime, ep, isWatched) {
  return `
    <a class="side-ep-card" href="capitulo.html?id=${anime.id}&ep=${ep.number}">
      <div class="side-ep-thumb">
        <img src="${ep.thumb}" alt="Miniatura del episodio ${ep.number}" loading="lazy">
        ${isWatched
          ? `<span class="side-ep-replay">${replayIconSvg()}</span><span class="side-ep-watched">Visto</span>`
          : `<span class="side-ep-play">${playIconSvg()}</span>`}
      </div>
      <div class="side-ep-body">
        <h3>E${ep.number} - ${ep.title}</h3>
        <span>${audioLabel(anime.audio)}</span>
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
   Almacenamiento local (por navegador): episodios ya vistos.
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

function getWatchedSet(animeId) {
  const map = readJSON(CH_KEYS.watched, {});
  return new Set(map[animeId] || []);
}
function markWatched(animeId, epNumber) {
  const map = readJSON(CH_KEYS.watched, {});
  const set = new Set(map[animeId] || []);
  set.add(epNumber);
  map[animeId] = [...set];
  writeJSON(CH_KEYS.watched, map);
}
