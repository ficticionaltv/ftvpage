/* ============================================================
   FicticionalTV — Página de detalle de anime
   El reproductor real vive en capitulo.html; aquí solo mostramos
   la ficha, el tráiler (si existe), el botón "Ver ahora" y la
   lista de episodios.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  function render() {
    const anime = getAnimeById(id) || ANIME_LIST[0];
    renderDetail(anime);
    renderTrailer(anime);
    renderWatchCta(anime);
    renderEpisodes(anime);
  }

  // ANIME_LIST llega de forma asíncrona desde Firestore, y puede volver
  // a cambiar en cualquier momento (por ejemplo, porque se editó un
  // capítulo o el tráiler desde el panel de administración, en esta
  // misma pestaña o en otra). Nos suscribimos a ambos eventos para que
  // la ficha del anime siempre muestre lo último guardado sin necesidad
  // de recargar la página a mano.
  onLibraryReady(render);
  onLibraryChange(render);
});

function renderDetail(anime) {
  document.title = `${anime.title} — FicticionalTV`;

  document.querySelector("#detail-banner").style.backgroundImage = `url('${anime.banner}')`;
  document.querySelector("#detail-poster").src = anime.cover;
  document.querySelector("#detail-poster").alt = `Portada de ${anime.title}`;
  document.querySelector("#detail-title").textContent = anime.title;
  document.querySelector("#detail-synopsis").textContent = anime.synopsis;
  updateSynopsisToggle();

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

/* La sinopsis se recorta a 3 líneas con CSS. Este toggle solo muestra
   el botón "Más detalles" cuando el texto realmente está recortado,
   y expande/contrae el párrafo al hacer clic. */
function updateSynopsisToggle() {
  const text = document.querySelector("#detail-synopsis");
  const toggle = document.querySelector("#synopsis-toggle");
  if (!text || !toggle) return;

  text.classList.remove("is-expanded");
  toggle.textContent = "Más detalles";

  requestAnimationFrame(() => {
    const isClamped = text.scrollHeight > text.clientHeight + 2;
    toggle.style.display = isClamped ? "inline-flex" : "none";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector("#synopsis-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    const text = document.querySelector("#detail-synopsis");
    if (!text) return;
    const expanded = text.classList.toggle("is-expanded");
    toggle.textContent = expanded ? "Ver menos" : "Más detalles";
  });
});

/* El botón "Ver ahora" lleva directo al reproductor real (capitulo.html)
   del primer episodio disponible. Si todavía no hay episodios cargados,
   el botón se deshabilita en vez de fingir que hay algo que ver. */
function renderWatchCta(anime) {
  const episodes = [...anime.episodes].sort((a, b) => a.number - b.number);
  const first = episodes[0];
  const ctaWatch = document.querySelector("#cta-watch");
  const ctaLabel = document.querySelector("#cta-watch-label");
  if (!ctaWatch) return;

  if (!first) {
    ctaWatch.removeAttribute("href");
    ctaWatch.classList.add("is-disabled");
    if (ctaLabel) ctaLabel.textContent = "Aún sin capítulos";
    return;
  }

  ctaWatch.href = `capitulo.html?id=${anime.id}&ep=${first.number}`;
  ctaWatch.classList.remove("is-disabled");
  if (ctaLabel) ctaLabel.textContent = "Ver ahora";
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
