/* ============================================================
   FicticionalTV — Página de capítulo (reproductor + navegación)
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ANIME_LIST llega de forma asíncrona desde Firestore, y puede volver
  // a cambiar mientras esta página sigue abierta (capítulo editado o
  // agregado desde el panel). Nos suscribimos a ambos eventos para que
  // el reproductor y el riel de episodios siempre reflejen lo último
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
  renderEngagement(anime, episode);
  renderDescription(anime);
  renderSidebar(anime, episodes, episode);
  renderEpisodesRail(anime, episodes, episode);

  const moreBtn = document.querySelector("#chapter-more-btn");
  if (moreBtn) {
    moreBtn.onclick = () => {
      const section = document.querySelector("#all-episodes-section");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
}

function renderPlayer(anime, episode) {
  const wrap = document.querySelector("#player-wrap");
  if (episode.embedUrl) {
    wrap.innerHTML = `
      <iframe
        src="${episode.embedUrl}"
        title="Reproductor de ${anime.title} — Episodio ${episode.number}"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowfullscreen
        referrerpolicy="no-referrer"
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

  renderSaveButton(anime);
}

function audioLabel(audio) {
  return audio && audio.trim() ? audio.trim() : "Español Latino";
}

/* Botón de guardar en mi lista (se recuerda por anime, en este navegador). */
function renderSaveButton(anime) {
  const btn = document.querySelector("#chapter-save-btn");
  if (!btn) return;
  const paint = () => {
    const saved = isAnimeSaved(anime.id);
    btn.classList.toggle("is-active", saved);
    btn.setAttribute("aria-pressed", String(saved));
    btn.title = saved ? "Guardado en mi lista" : "Guardar en mi lista";
    btn.setAttribute("aria-label", btn.title);
    btn.innerHTML = bookmarkIconSvg(saved);
  };
  btn.onclick = () => { toggleAnimeSaved(anime.id); paint(); };
  paint();
}

/* Botones de me gusta / no me gusta y compartir. Los conteos son
   simulados: parten de un número fijo por episodio (para que se vean
   como un episodio "real" con actividad) y suman el voto local de
   quien esté mirando, guardado en este navegador. */
function renderEngagement(anime, episode) {
  const likeBtn = document.querySelector("#btn-like");
  const dislikeBtn = document.querySelector("#btn-dislike");
  const likeCountEl = document.querySelector("#like-count");
  const dislikeCountEl = document.querySelector("#dislike-count");

  const base = baseVoteCounts(anime.id, episode.number);

  function paint() {
    const vote = getUserVote(anime.id, episode.number);
    likeCountEl.textContent = formatCount(base.likes + (vote === "like" ? 1 : 0));
    dislikeCountEl.textContent = formatCount(base.dislikes + (vote === "dislike" ? 1 : 0));
    likeBtn.classList.toggle("is-active", vote === "like");
    dislikeBtn.classList.toggle("is-active", vote === "dislike");
    likeBtn.setAttribute("aria-pressed", String(vote === "like"));
    dislikeBtn.setAttribute("aria-pressed", String(vote === "dislike"));
  }

  likeBtn.onclick = () => { setUserVote(anime.id, episode.number, "like"); paint(); };
  dislikeBtn.onclick = () => { setUserVote(anime.id, episode.number, "dislike"); paint(); };
  paint();

  const shareBtn = document.querySelector("#chapter-share-btn");
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
      const originalTitle = btn.title;
      btn.classList.add("is-copied");
      btn.title = "¡Enlace copiado!";
      setTimeout(() => { btn.classList.remove("is-copied"); btn.title = originalTitle; }, 1800);
    } catch (err) { /* clipboard no disponible, ignoramos silenciosamente */ }
  }
}

/* Sinopsis del anime a modo de descripción del episodio (recortada a 3
   líneas, con un botón "Ver más" que solo aparece si el texto se corta). */
function renderDescription(anime) {
  const text = document.querySelector("#chapter-description");
  const toggle = document.querySelector("#chapter-desc-toggle");
  if (!text || !toggle) return;

  text.textContent = anime.synopsis;
  text.classList.remove("is-expanded");
  toggle.textContent = "Ver más";

  requestAnimationFrame(() => {
    const isClamped = text.scrollHeight > text.clientHeight + 2;
    toggle.style.display = isClamped ? "inline-flex" : "none";
  });

  toggle.onclick = () => {
    const expanded = text.classList.toggle("is-expanded");
    toggle.textContent = expanded ? "Ver menos" : "Ver más";
  };
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

function renderEpisodesRail(anime, episodes, episode) {
  const rail = document.querySelector("#chapter-episodes-rail");
  const watched = getWatchedSet(anime.id);
  rail.innerHTML = episodes.map(e => `
    <a class="episode-card ${e.number === episode.number ? "is-active" : ""}" href="capitulo.html?id=${anime.id}&ep=${e.number}">
      <div class="episode-thumb">
        <img src="${e.thumb}" alt="Miniatura del episodio ${e.number}" loading="lazy">
        <span class="ep-num">EP ${e.number}</span>
        ${(watched.has(e.number) && e.number !== episode.number) ? `<span class="ep-watched-badge">Visto</span>` : `<span class="play-circle">${playIconSvg()}</span>`}
      </div>
      <div class="episode-body">
        <h3>${e.title}</h3>
        <span>${e.embedUrl ? e.duration : "Sin video"}</span>
      </div>
    </a>
  `).join("");
}

/* ------------------------------------------------------------
   Íconos (SVG en línea, heredan color con currentColor)
   ------------------------------------------------------------ */
function bookmarkIconSvg(filled) {
  return `<svg width="17" height="17" viewBox="0 0 20 20" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 3.5h10a.5.5 0 0 1 .5.5v12.3c0 .4-.45.63-.78.4L10 13.2l-4.72 3.5a.5.5 0 0 1-.78-.4V4a.5.5 0 0 1 .5-.5z"/></svg>`;
}
function replayIconSvg() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 1 1.8 4.07"/><path d="M2.4 3.8v3.5h3.5"/></svg>`;
}

/* ------------------------------------------------------------
   "Me gusta" / "No me gusta": conteos simulados de forma
   determinística (mismo episodio → mismo número base siempre) más
   el voto de quien mira, guardado en localStorage.
   ------------------------------------------------------------ */
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function baseVoteCounts(animeId, epNumber) {
  const seed = hashSeed(`${animeId}#${epNumber}`);
  return {
    likes: 380 + (seed % 5200),
    dislikes: 4 + ((seed >>> 3) % 90)
  };
}
function formatCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/* ------------------------------------------------------------
   Almacenamiento local (por navegador): voto del episodio, lista
   de "guardados" y episodios ya vistos.
   ------------------------------------------------------------ */
const CH_KEYS = {
  votes: "ftv_chapter_votes",
  saved: "ftv_saved_animes",
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

function getUserVote(animeId, epNumber) {
  const votes = readJSON(CH_KEYS.votes, {});
  return votes[`${animeId}:${epNumber}`] || null;
}
function setUserVote(animeId, epNumber, vote) {
  const votes = readJSON(CH_KEYS.votes, {});
  const key = `${animeId}:${epNumber}`;
  votes[key] = votes[key] === vote ? undefined : vote;
  if (!votes[key]) delete votes[key];
  writeJSON(CH_KEYS.votes, votes);
}

function isAnimeSaved(animeId) {
  return readJSON(CH_KEYS.saved, []).includes(animeId);
}
function toggleAnimeSaved(animeId) {
  const list = readJSON(CH_KEYS.saved, []);
  const idx = list.indexOf(animeId);
  if (idx >= 0) list.splice(idx, 1); else list.push(animeId);
  writeJSON(CH_KEYS.saved, list);
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
