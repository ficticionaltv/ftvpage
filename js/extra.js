/* ============================================================
   FicticionalTV — Página de detalle de un extra
   Espejo de js/anime.js: la ficha se ve igual (banner, poster,
   sinopsis), pero en vez de "Episodios" muestra dos cuadrículas,
   "Audio" y "Video", cada una enlazando al mismo reproductor que
   usan los episodios de anime (capitulo.html).
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  function render() {
    const extra = getExtraById(id) || EXTRAS_LIST[0];
    if (!extra) {
      document.title = "FicticionalTV";
      document.querySelector("main").innerHTML = `
        <div class="container">
          <div class="empty-state">
            Todavía no hay extras cargados.<br>
            <a class="btn btn-primary" style="margin-top:16px;" href="admin.html">Agregar extras en el panel</a>
          </div>
        </div>
      `;
      return;
    }
    renderExtraDetail(extra);
    renderExtraItems(extra, "audio", "#extra-audio-grid");
    renderExtraItems(extra, "video", "#extra-video-grid");
  }

  // EXTRAS_LIST llega de forma asíncrona desde Firestore, y puede volver
  // a cambiar mientras esta página sigue abierta (contenido editado o
  // agregado desde el panel de administración).
  onLibraryReady(render);
  onLibraryChange(render);
});

function renderExtraDetail(extra) {
  document.title = `${extra.title} — FicticionalTV`;

  document.querySelector("#detail-banner").style.backgroundImage = `url('${extra.banner}')`;
  document.querySelector("#detail-poster").src = extra.cover;
  document.querySelector("#detail-poster").alt = `Portada de ${extra.title}`;
  document.querySelector("#detail-title").textContent = extra.title;

  const logoEl = document.querySelector("#detail-logo");
  const titleEl = document.querySelector("#detail-title");
  if (logoEl && titleEl) {
    if (extra.logo) {
      logoEl.src = extra.logo;
      logoEl.alt = extra.title;
      logoEl.style.display = "";
      titleEl.style.display = "none";
    } else {
      logoEl.style.display = "none";
      titleEl.style.display = "";
    }
  }

  document.querySelector("#detail-synopsis").textContent = extra.synopsis;
  updateExtraSynopsisToggle();

  document.querySelector("#detail-genres").innerHTML =
    (extra.genres || []).map(g => `<span class="tag">${g}</span>`).join("");

  const totalItems = (extra.audio || []).length + (extra.video || []).length;
  document.querySelector("#detail-meta").innerHTML = `
    <span class="stars">${starString(extra.rating)} ${extra.rating.toFixed(1)}</span>
    <span class="sep">|</span>
    <span>${extra.year}</span>
    <span class="sep">|</span>
    <span>${extra.studio}</span>
    <span class="sep">|</span>
    <span>${totalItems} video${totalItems === 1 ? "" : "s"}</span>
  `;

  const genreEl = document.querySelector("#info-genre");
  const studioEl = document.querySelector("#info-studio");
  if (genreEl) genreEl.textContent = (extra.genres || []).length ? extra.genres.join(", ") : "—";
  if (studioEl) studioEl.textContent = extra.studio && extra.studio.trim() ? extra.studio.trim() : "—";
}

/* La sinopsis se recorta a 3 líneas con CSS, igual que en anime.html. */
function updateExtraSynopsisToggle() {
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

function renderExtraItems(extra, kind, selector) {
  const grid = document.querySelector(selector);
  if (!grid) return;
  const items = [...(kind === "video" ? extra.video : extra.audio)].sort((a, b) => a.number - b.number);
  const label = kind === "audio" ? "Audio" : "Video";

  if (!items.length) {
    grid.innerHTML = `<p>Todavía no hay contenido de ${label.toLowerCase()} cargado para este extra. Agrégalo desde el <a href="admin.html">panel de administración</a>.</p>`;
    return;
  }

  grid.innerHTML = items.map(item => `
    <a class="episode-card" href="capitulo.html?extra=${extra.id}&type=${kind}&num=${item.number}">
      <div class="episode-thumb">
        <img src="${item.thumb}" alt="Miniatura de ${label} ${item.number}" loading="lazy">
        <span class="ep-num">${kind === "audio" ? "A" : "V"} ${item.number}</span>
        <span class="play-circle">${playIconSvg()}</span>
      </div>
      <div class="episode-body">
        <h3>${item.title}</h3>
        <span>${item.embedUrl ? item.duration : "Sin video"}</span>
      </div>
    </a>
  `).join("");
}
