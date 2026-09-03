/* ============================================================
   FicticionalTV — Página de detalle de anime
   El reproductor real vive en capitulo.html; aquí solo mostramos
   una vista previa que enlaza al primer episodio disponible.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ANIME_LIST llega de forma asíncrona desde Firestore.
  onLibraryReady(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const anime = getAnimeById(id) || ANIME_LIST[0];

    renderDetail(anime);
    renderTrailer(anime);
    renderPlayerPreview(anime);
    renderEpisodes(anime);
  });
});

function renderDetail(anime) {
  document.title = `${anime.title} — FicticionalTV`;

  document.querySelector("#detail-banner").style.backgroundImage = `url('${anime.banner}')`;
  document.querySelector("#detail-poster").src = anime.cover;
  document.querySelector("#detail-poster").alt = `Portada de ${anime.title}`;
  document.querySelector("#detail-title").textContent = anime.title;
  document.querySelector("#detail-synopsis").textContent = anime.synopsis;

  document.querySelector("#detail-genres").innerHTML =
    anime.genres.map(g => `<span class="tag">${g}</span>`).join("");

  document.querySelector("#detail-meta").innerHTML = `
    <span class="stars">${starString(anime.rating)} ${anime.rating.toFixed(1)}</span>
    <span class="sep">|</span>
    <span>${anime.year}</span>
    <span class="sep">|</span>
    <span>${anime.studio}</span>
    <span class="sep">|</span>
    <span>${anime.episodes.length} episodio${anime.episodes.length === 1 ? "" : "s"}</span>
  `;
}

function renderTrailer(anime) {
  const container = document.querySelector("#trailer-container");
  if (!container) return;

  if (anime.trailerEmbedUrl) {
    container.innerHTML = `
      <div class="trailer-frame">
        <iframe src="${anime.trailerEmbedUrl}" title="Tráiler de ${escapeHtml(anime.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    `;
  } else {
    container.innerHTML = `<div class="trailer-empty">Todavía no hay tráiler disponible para este anime.</div>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function renderPlayerPreview(anime) {
  const episodes = [...anime.episodes].sort((a, b) => a.number - b.number);
  const first = episodes[0];

  const screen = document.querySelector("#player-screen");
  const titleEl = document.querySelector("#player-current-title");
  const timeEl = document.querySelector("#player-time");
  const ctaWatch = document.querySelector("#cta-watch");

  if (!first) {
    screen.style.backgroundImage = `url('${anime.banner}')`;
    screen.removeAttribute("href");
    screen.classList.add("is-disabled");
    titleEl.textContent = `${anime.title} · Aún sin capítulos cargados`;
    timeEl.textContent = "—";
    if (ctaWatch) { ctaWatch.removeAttribute("href"); ctaWatch.classList.add("is-disabled"); }
    return;
  }

  const target = `capitulo.html?id=${anime.id}&ep=${first.number}`;
  screen.style.backgroundImage = `url('${first.thumb}')`;
  screen.href = target;
  screen.classList.remove("is-disabled");
  titleEl.textContent = `${anime.title} · Episodio ${first.number}${first.embedUrl ? "" : " (sin reproductor aún)"}`;
  timeEl.textContent = `00:00 / ${first.duration}`;
  if (ctaWatch) { ctaWatch.href = target; ctaWatch.classList.remove("is-disabled"); }
}

function renderEpisodes(anime) {
  const grid = document.querySelector("#episodes-grid");
  const episodes = [...anime.episodes].sort((a, b) => a.number - b.number);

  if (!episodes.length) {
    grid.innerHTML = `<p>Todavía no hay capítulos cargados para este anime. Agrégalos desde el <a href="admin.html?id=${anime.id}">panel de administración</a>.</p>`;
    return;
  }

  grid.innerHTML = episodes.map(ep => `
    <a class="episode-card" href="capitulo.html?id=${anime.id}&ep=${ep.number}">
      <div class="episode-thumb">
        <img src="${ep.thumb}" alt="Miniatura del episodio ${ep.number}" loading="lazy">
        <span class="ep-num">EP ${ep.number}</span>
        <span class="play-circle">${playIconSvg()}</span>
      </div>
      <div class="episode-body">
        <h3>${ep.title}</h3>
        <span>${ep.embedUrl ? ep.duration : "Sin video"}</span>
      </div>
    </a>
  `).join("");
}
