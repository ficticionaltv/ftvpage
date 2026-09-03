/* ============================================================
   FicticionalTV — Panel de administración
   - Busca animes en Jikan API y los agrega a la biblioteca local.
   - Permite crear, editar y eliminar capítulos (con su embed).
   Todo se guarda en localStorage (sin backend ni login).
   ============================================================ */

let lastSearchResults = [];
let selectedAnimeId = null;
let editingEpisodeNumber = null;

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  selectedAnimeId = params.get("id") || null;

  document.querySelector("#jikan-search-form").addEventListener("submit", handleSearch);

  renderAnimeList();
  renderAnimeDetail();
});

/* ------------------------------------------------------------
   Búsqueda en Jikan
   ------------------------------------------------------------ */
async function handleSearch(e) {
  e.preventDefault();
  const input = document.querySelector("#jikan-search-input");
  const query = input.value.trim();
  const status = document.querySelector("#jikan-status");
  const resultsEl = document.querySelector("#jikan-results");

  if (!query) return;

  status.textContent = "Buscando en Jikan…";
  resultsEl.innerHTML = "";

  try {
    lastSearchResults = await searchJikanAnime(query);
    if (!lastSearchResults.length) {
      status.textContent = `Sin resultados para "${query}".`;
      return;
    }
    status.textContent = `${lastSearchResults.length} resultado(s) para "${query}".`;
    renderSearchResults();
  } catch (err) {
    console.error(err);
    status.textContent = "No se pudo conectar con la API de Jikan. Espera unos segundos (tiene límite de peticiones) e intenta de nuevo.";
  }
}

function renderSearchResults() {
  const resultsEl = document.querySelector("#jikan-results");

  resultsEl.innerHTML = lastSearchResults.map((item, i) => {
    const added = animeExistsByMalId(item.malId);
    return `
      <div class="jikan-card">
        <img src="${item.cover || 'img/'}" alt="Portada de ${escapeAttr(item.title)}" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="jikan-card-body">
          <h3>${item.title}</h3>
          <p class="jikan-card-meta">${item.year || "Año desconocido"} · ${item.studio}${item.rating ? " · ★ " + item.rating.toFixed(1) : ""}</p>
          <div class="jikan-card-genres">${item.genres.slice(0, 4).map(g => `<span class="tag">${g}</span>`).join("")}</div>
          <button class="btn ${added ? "btn-ghost" : "btn-primary"} btn-sm" data-add="${i}" ${added ? "disabled" : ""}>
            ${added ? "Ya está en tu biblioteca" : "Agregar a la biblioteca"}
          </button>
        </div>
      </div>
    `;
  }).join("");

  resultsEl.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = lastSearchResults[Number(btn.dataset.add)];
      const record = addAnimeToLibrary(item);
      selectedAnimeId = record.id;
      editingEpisodeNumber = null;
      renderAnimeList();
      renderAnimeDetail();
      renderSearchResults();
      document.querySelector("#admin-anime-detail").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/* ------------------------------------------------------------
   Lista de animes en la biblioteca
   ------------------------------------------------------------ */
function renderAnimeList() {
  const listEl = document.querySelector("#admin-anime-list");
  const sorted = [...ANIME_LIST].sort((a, b) => a.title.localeCompare(b.title));

  listEl.innerHTML = sorted.map(a => `
    <button class="admin-anime-item ${a.id === selectedAnimeId ? "is-active" : ""}" data-select="${a.id}">
      <img src="${a.cover}" alt="">
      <span>
        <strong>${a.title}</strong>
        <small>${a.episodes.length} capítulo${a.episodes.length === 1 ? "" : "s"} · ${a.source === "jikan" ? "Jikan" : "Semilla"}</small>
      </span>
    </button>
  `).join("");

  listEl.querySelectorAll("[data-select]").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedAnimeId = btn.dataset.select;
      editingEpisodeNumber = null;
      renderAnimeList();
      renderAnimeDetail();
    });
  });
}

/* ------------------------------------------------------------
   Detalle de anime seleccionado: info + gestión de capítulos
   ------------------------------------------------------------ */
function renderAnimeDetail() {
  const detailEl = document.querySelector("#admin-anime-detail");
  const anime = selectedAnimeId ? getAnimeById(selectedAnimeId) : null;

  if (!anime) {
    detailEl.innerHTML = `<p class="admin-empty">Selecciona un anime de la lista (o agrega uno nuevo desde Jikan arriba) para gestionar sus capítulos.</p>`;
    return;
  }

  const episodes = [...anime.episodes].sort((a, b) => a.number - b.number);
  const editing = editingEpisodeNumber !== null ? episodes.find(e => e.number === editingEpisodeNumber) : null;
  const nextNumber = episodes.length ? Math.max(...episodes.map(e => e.number)) + 1 : 1;

  detailEl.innerHTML = `
    <div class="admin-anime-header">
      <img src="${anime.cover}" alt="Portada de ${escapeAttr(anime.title)}">
      <div>
        <h3>${anime.title}</h3>
        <p class="jikan-card-meta">${anime.year} · ${anime.studio} · ★ ${anime.rating.toFixed(1)}</p>
        <div class="hero-genres">${anime.genres.map(g => `<span class="tag">${g}</span>`).join("")}</div>
        <div class="admin-anime-actions">
          <a class="btn btn-ghost btn-sm" href="anime.html?id=${anime.id}" target="_blank" rel="noopener">Ver ficha</a>
          <button class="btn btn-ghost btn-sm" id="delete-anime-btn" type="button">Eliminar anime</button>
        </div>
      </div>
    </div>

    <h4 class="admin-subhead">${editing ? `Editando episodio ${editing.number}` : "Agregar capítulo"}</h4>
    <form class="admin-episode-form" id="episode-form">
      <div class="form-row">
        <label>N.º de episodio
          <input class="input" type="number" min="1" id="ep-number" value="${editing ? editing.number : nextNumber}" ${editing ? "disabled" : ""} required>
        </label>
        <label>Duración
          <input class="input" type="text" id="ep-duration" value="${editing ? escapeAttr(editing.duration) : "23 min"}" placeholder="23 min">
        </label>
      </div>
      <label>Título del episodio
        <input class="input" type="text" id="ep-title" value="${editing ? escapeAttr(editing.title) : ""}" placeholder="Ej. El despertar" required>
      </label>
      <label>URL del reproductor (embed)
        <input class="input" type="url" id="ep-embed" value="${editing ? escapeAttr(editing.embedUrl || "") : ""}" placeholder="https://ejemplo.com/embed/xxxx">
      </label>
      <p class="admin-hint">Pega ahí la URL de "embed" que te da tu proveedor de video (la que normalmente va dentro de un &lt;iframe&gt;). Puedes dejarlo vacío y completarlo después.</p>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">${editing ? "Guardar cambios" : "Agregar capítulo"}</button>
        ${editing ? `<button class="btn btn-ghost btn-sm" type="button" id="cancel-edit-btn">Cancelar</button>` : ""}
      </div>
    </form>

    <h4 class="admin-subhead">Capítulos (${episodes.length})</h4>
    <div class="admin-episode-list" id="admin-episode-list">
      ${episodes.length ? episodes.map(ep => `
        <div class="admin-episode-row">
          <img src="${ep.thumb}" alt="">
          <div class="admin-episode-info">
            <strong>EP ${ep.number} · ${ep.title}</strong>
            <span class="pill ${ep.embedUrl ? "pill-ok" : "pill-warn"}">${ep.embedUrl ? "Con reproductor" : "Sin reproductor"}</span>
          </div>
          <div class="admin-episode-actions">
            <a class="btn btn-ghost btn-sm" href="capitulo.html?id=${anime.id}&ep=${ep.number}" target="_blank" rel="noopener">Ver</a>
            <button class="btn btn-ghost btn-sm" type="button" data-edit="${ep.number}">Editar</button>
            <button class="btn btn-ghost btn-sm" type="button" data-delete="${ep.number}">Eliminar</button>
          </div>
        </div>
      `).join("") : `<p class="admin-empty">Todavía no hay capítulos para este anime.</p>`}
    </div>
  `;

  document.querySelector("#episode-form").addEventListener("submit", handleEpisodeSubmit);

  const cancelBtn = document.querySelector("#cancel-edit-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      editingEpisodeNumber = null;
      renderAnimeDetail();
    });
  }

  document.querySelector("#delete-anime-btn").addEventListener("click", () => handleDeleteAnime(anime.id));

  detailEl.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      editingEpisodeNumber = Number(btn.dataset.edit);
      renderAnimeDetail();
      document.querySelector("#episode-form").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  detailEl.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const number = Number(btn.dataset.delete);
      if (!confirm(`¿Eliminar el episodio ${number}?`)) return;
      removeEpisode(anime.id, number);
      if (editingEpisodeNumber === number) editingEpisodeNumber = null;
      renderAnimeList();
      renderAnimeDetail();
    });
  });
}

function handleEpisodeSubmit(e) {
  e.preventDefault();
  const anime = getAnimeById(selectedAnimeId);
  if (!anime) return;

  const number = Number(document.querySelector("#ep-number").value);
  const title = document.querySelector("#ep-title").value.trim();
  const duration = document.querySelector("#ep-duration").value.trim();
  const embedUrl = document.querySelector("#ep-embed").value.trim();

  if (editingEpisodeNumber !== null) {
    updateEpisode(anime.id, editingEpisodeNumber, { title, duration, embedUrl });
  } else {
    addEpisodeToAnime(anime.id, { number, title, duration, embedUrl });
  }

  editingEpisodeNumber = null;
  renderAnimeList();
  renderAnimeDetail();
}

function handleDeleteAnime(id) {
  const anime = getAnimeById(id);
  if (!anime) return;
  if (!confirm(`¿Eliminar "${anime.title}" y todos sus capítulos? Esta acción no se puede deshacer.`)) return;

  removeAnimeFromLibrary(id);
  selectedAnimeId = null;
  editingEpisodeNumber = null;
  renderAnimeList();
  renderAnimeDetail();
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
