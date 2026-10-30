/* ============================================================
   FicticionalTV — Página de detalle de anime
   El reproductor real vive en capitulo.html; aquí solo mostramos
   la ficha, el tráiler (si existe), el botón "Ver ahora" y la
   lista de episodios.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  // Temporada elegida. Se lee de ?season=N (así un enlace compartido abre
  // directamente esa temporada) y se actualiza en la URL al cambiarla.
  let selectedSeasonNumber = Number(params.get("season")) || null;

  function render() {
    const anime = getAnimeById(id) || getVisibleAnimes()[0] || ANIME_LIST[0];
    const season = getSeason(anime, selectedSeasonNumber);
    selectedSeasonNumber = season.number;

    renderDetail(anime, season);
    renderSeasonPicker(anime, season, (number) => {
      selectedSeasonNumber = number;
      const url = new URL(window.location.href);
      url.searchParams.set("season", number);
      history.replaceState(null, "", url);
      render();
    });
    renderTrailer(anime, season);
    renderEpisodes(anime, season);
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

function renderDetail(anime, season) {
  document.title = `${anime.title} — FicticionalTV`;

  document.querySelector("#detail-banner").style.backgroundImage = `url('${anime.banner}')`;
  document.querySelector("#detail-poster").src = anime.cover;
  document.querySelector("#detail-poster").alt = `Portada de ${anime.title}`;
  document.querySelector("#detail-title").textContent = anime.title;
  const logoEl = document.querySelector("#detail-logo");
  const titleEl = document.querySelector("#detail-title");
  if (logoEl && titleEl) {
    if (anime.logo) {
      logoEl.src = anime.logo;
      logoEl.alt = anime.title;
      logoEl.style.display = "";
      titleEl.style.display = "none";
    } else {
      logoEl.style.display = "none";
      titleEl.style.display = "";
    }
  }
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
    <span>${season.episodes.length} episodio${season.episodes.length === 1 ? "" : "s"}</span>
    ${anime.seasons.length > 1 ? `<span class="sep">|</span><span>${anime.seasons.length} temporadas</span>` : ""}
  `;

  renderExtraInfo(anime);
}

/* Sección editable (desde el panel de administración) con audio, reparto,
   género y estudio. Si un campo no se ha completado todavía, mostramos un
   guion en vez de dejar la fila vacía o con "undefined". */
function renderExtraInfo(anime) {
  const audioEl = document.querySelector("#info-audio");
  const castEl = document.querySelector("#info-cast");
  const genreEl = document.querySelector("#info-genre");
  const studioEl = document.querySelector("#info-studio");

  if (audioEl) audioEl.textContent = anime.audio && anime.audio.trim() ? anime.audio.trim() : "—";
  if (castEl) castEl.textContent = anime.cast && anime.cast.trim() ? anime.cast.trim() : "—";
  if (genreEl) genreEl.textContent = (anime.genres || []).length ? anime.genres.join(", ") : "—";
  if (studioEl) studioEl.textContent = anime.studio && anime.studio.trim() ? anime.studio.trim() : "—";
}

/* Menú desplegable de temporadas. Hay dos contenedores (uno bajo la portada,
   visible en PC, y otro antes del tráiler, visible en móviles); el CSS
   muestra solo el que corresponde. Con una sola temporada no se muestra. */
function renderSeasonPicker(anime, season, onChange) {
  const hosts = document.querySelectorAll(".season-picker");
  const multiple = anime.seasons.length > 1;

  hosts.forEach((host, i) => {
    host.hidden = !multiple;
    if (!multiple) { host.innerHTML = ""; return; }

    const selectId = `season-select-${i}`;
    host.innerHTML = `
      <label class="season-picker-label" for="${selectId}">Temporada</label>
      <div class="season-select-wrap">
        <select class="season-select" id="${selectId}" aria-label="Seleccionar temporada">
          ${anime.seasons.map(s => `
            <option value="${s.number}" ${s.number === season.number ? "selected" : ""}>${escapeHtml(seasonLabel(s))}</option>
          `).join("")}
        </select>
        <svg class="season-select-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>
      </div>
    `;
    host.querySelector("select").addEventListener("change", (e) => onChange(Number(e.target.value)));
  });
}

function renderTrailer(anime, season) {
  const container = document.querySelector("#trailer-container");
  if (!container) return;

  const heading = document.querySelector("#trailer-heading");
  if (heading) heading.textContent = anime.seasons.length > 1 ? `Tráiler · Temporada ${season.number}` : "Tráiler";

  if (season.trailerEmbedUrl) {
    // Mismo reproductor propio que en los capítulos. Si ya está montado con
    // este mismo tráiler (p. ej. llegó una actualización de Firestore), no
    // lo reiniciamos para no cortar la reproducción.
    let frame = container.querySelector(".trailer-frame");
    if (frame && frame.dataset.src === season.trailerEmbedUrl && frame._ftv) return;
    container.innerHTML = `<div class="trailer-frame"></div>`;
    frame = container.querySelector(".trailer-frame");
    frame.dataset.src = season.trailerEmbedUrl;
    FtvPlayer.mount(frame, {
      src: season.trailerEmbedUrl,
      title: `Tráiler de ${anime.title}`,
      resumeKey: ""
    });
  } else {
    container.innerHTML = `<div class="trailer-empty">Todavía no hay tráiler disponible para ${anime.seasons.length > 1 ? "esta temporada" : "este anime"}.</div>`;
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

function renderEpisodes(anime, season) {
  const grid = document.querySelector("#episodes-grid");
  const episodes = [...season.episodes].sort((a, b) => a.number - b.number);

  if (!episodes.length) {
    grid.innerHTML = `<p>Todavía no hay capítulos cargados para ${anime.seasons.length > 1 ? "esta temporada" : "este anime"}. Agrégalos desde el <a href="admin.html?id=${anime.id}">panel de administración</a>.</p>`;
    return;
  }

  grid.innerHTML = episodes.map(ep => `
    <a class="episode-card" href="capitulo.html?id=${anime.id}&season=${season.number}&ep=${ep.number}">
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
