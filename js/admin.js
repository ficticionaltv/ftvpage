/* ============================================================
   FicticionalTV — Panel de administración
   - Protegido con un código de acceso simple (ver ADMIN_ACCESS_CODE).
   - Busca animes en AniList API y los agrega a la biblioteca local.
   - Permite crear, editar y eliminar capítulos (con su embed).
   Todo se guarda en localStorage (sin backend ni cuenta de usuario;
   la autenticación es solo una barrera de acceso local, no seguridad real).
   ============================================================ */

const ADMIN_ACCESS_CODE = "7891";
const ADMIN_AUTH_KEY = "ficticionaltv_admin_auth";

let lastSearchResults = [];
let selectedAnimeId = null;
let editingEpisodeNumber = null;

/* ------------------------------------------------------------
   Estado de conexión con Firebase (independiente del gate de acceso,
   así se ve incluso si Firestore tarda o falla en conectar)
   ------------------------------------------------------------ */
function renderFirebaseStatus(status) {
  const pill = document.querySelector("#firebase-status-pill");
  if (!pill) return;
  if (status === "online") {
    pill.className = "pill pill-ok";
    pill.textContent = "Conectado a Firebase — los cambios se guardan para todo el mundo";
  } else if (status === "offline") {
    pill.className = "pill pill-down";
    pill.textContent = "Sin conexión con Firebase — revisa que la base de datos Firestore exista y sus reglas permitan el acceso. Los cambios de esta sesión NO se guardarán.";
  } else {
    pill.className = "pill pill-warn";
    pill.textContent = "Conectando con Firebase…";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderFirebaseStatus(getLibraryConnectionStatus());
  onLibraryConnectionChange(renderFirebaseStatus);

  const gate = document.querySelector("#admin-auth-gate");
  const protectedRoot = document.querySelector("#admin-protected");
  const form = document.querySelector("#admin-auth-form");
  const input = document.querySelector("#admin-auth-input");
  const error = document.querySelector("#admin-auth-error");
  const logoutBtn = document.querySelector("#admin-logout-btn");

  function unlock() {
    sessionStorage.setItem(ADMIN_AUTH_KEY, "1");
    if (gate) gate.style.display = "none";
    if (protectedRoot) protectedRoot.style.display = "";
    if (logoutBtn) logoutBtn.style.display = "";
    // ANIME_LIST llega de forma asíncrona desde Firestore.
    onLibraryReady(() => initAdminPanel());
  }

  if (sessionStorage.getItem(ADMIN_AUTH_KEY) === "1") {
    unlock();
  } else if (gate) {
    gate.style.display = "";
    if (protectedRoot) protectedRoot.style.display = "none";
    if (input) setTimeout(() => input.focus(), 50);
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = (input.value || "").trim();
      if (value === ADMIN_ACCESS_CODE) {
        if (error) error.textContent = "";
        form.reset();
        unlock();
      } else {
        if (error) error.textContent = "Código incorrecto. Intenta de nuevo.";
        input.value = "";
        input.focus();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem(ADMIN_AUTH_KEY);
      window.location.reload();
    });
  }
});

/* ------------------------------------------------------------
   Inicialización del panel (solo tras autenticarse)
   ------------------------------------------------------------ */
function initAdminPanel() {
  const params = new URLSearchParams(window.location.search);
  selectedAnimeId = params.get("id") || null;

  document.querySelector("#anilist-search-form").addEventListener("submit", handleSearch);

  const pingBtn = document.querySelector("#anilist-ping-btn");
  if (pingBtn) pingBtn.addEventListener("click", checkAniListStatus);
  checkAniListStatus(); // comprobación automática al entrar al panel

  const resetBtn = document.querySelector("#reset-library-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!confirm("Esto borra todos los animes y capítulos agregados en este navegador y vuelve al catálogo original de data.js. ¿Continuar?")) return;
      resetLibraryToSeed();
      selectedAnimeId = null;
      editingEpisodeNumber = null;
      lastSearchResults = [];
      document.querySelector("#anilist-results").innerHTML = "";
      document.querySelector("#anilist-status").textContent = "";
      renderAnimeList();
      renderAnimeDetail();
    });
  }

  renderAnimeList();
  renderAnimeDetail();

  // Si Firestore confirma el cambio (o llega un cambio desde otro
  // dispositivo/pestaña), refresca la lista y el detalle para que el
  // panel siempre muestre exactamente lo que hay guardado.
  onLibraryChange(() => {
    renderAnimeList();
    renderAnimeDetail();
  });
}

/* ------------------------------------------------------------
   Ping de AniList (comprobar que la API responde)
   ------------------------------------------------------------ */
async function checkAniListStatus() {
  const pill = document.querySelector("#anilist-ping-pill");
  const btn = document.querySelector("#anilist-ping-btn");
  if (!pill) return;

  pill.className = "pill pill-warn";
  pill.textContent = "Comprobando…";
  if (btn) btn.disabled = true;

  const result = await pingAniList();

  if (result.ok) {
    pill.className = "pill pill-ok";
    pill.textContent = `AniList en línea (${result.ms} ms)`;
  } else if (result.status) {
    pill.className = "pill pill-warn";
    pill.textContent = `AniList responde con errores (código ${result.status})`;
  } else {
    pill.className = "pill pill-down";
    pill.textContent = "Sin conexión con AniList";
  }

  if (btn) btn.disabled = false;
}

/* ------------------------------------------------------------
   Búsqueda en AniList
   ------------------------------------------------------------ */
let searchInFlight = false;

async function handleSearch(e) {
  e.preventDefault();
  if (searchInFlight) return; // evita disparar varias búsquedas a la vez (dispara 429)

  const input = document.querySelector("#anilist-search-input");
  const query = input.value.trim();
  const status = document.querySelector("#anilist-status");
  const resultsEl = document.querySelector("#anilist-results");
  const submitBtn = document.querySelector("#anilist-search-form button[type=submit]");

  if (!query) return;

  searchInFlight = true;
  submitBtn.disabled = true;
  status.textContent = "Buscando en AniList…";
  resultsEl.innerHTML = "";

  try {
    lastSearchResults = await searchAniListAnime(query);
    if (!lastSearchResults.length) {
      status.textContent = `Sin resultados para "${query}".`;
      return;
    }
    status.textContent = `${lastSearchResults.length} resultado(s) para "${query}".`;
    renderSearchResults();
  } catch (err) {
    console.error(err);
    status.textContent = describeAniListError(err);
  } finally {
    searchInFlight = false;
    submitBtn.disabled = false;
  }
}

function describeAniListError(err) {
  if (err && err.message === "network") {
    if (window.location.protocol === "file:") {
      return "No se pudo conectar con AniList porque la página se abrió con doble clic (protocolo file://). Los navegadores bloquean las peticiones a APIs externas en ese modo: sirve la carpeta con un servidor local (por ejemplo \"python3 -m http.server\" o la extensión Live Server) y vuelve a intentarlo.";
    }
    return "No se pudo conectar con la API de AniList (fallo de red o CORS). Revisa tu conexión a internet y vuelve a intentarlo.";
  }
  if (err && err.status === 429) {
    return "AniList está limitando las peticiones (demasiadas búsquedas seguidas). Espera unos segundos e intenta de nuevo.";
  }
  if (err && [502, 503, 504].includes(err.status)) {
    return "La API de AniList está teniendo problemas temporales en su servidor (no es algo de tu sitio). Espera un momento y vuelve a buscar; si sigue fallando, revisa https://status.anilist.co.";
  }
  if (err && err.status) {
    return `AniList respondió con un error (código ${err.status}). Intenta de nuevo en unos segundos.`;
  }
  return "No se pudo completar la búsqueda en AniList. Intenta de nuevo en unos segundos.";
}

function renderSearchResults() {
  const resultsEl = document.querySelector("#anilist-results");

  resultsEl.innerHTML = lastSearchResults.map((item, i) => {
    const added = animeExistsByAnilistId(item.anilistId);
    return `
      <div class="anilist-card">
        <img src="${item.cover || 'img/'}" alt="Portada de ${escapeAttr(item.title)}" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="anilist-card-body">
          <h3>${item.title}</h3>
          <p class="anilist-card-meta">${item.year || "Año desconocido"} · ${item.studio}${item.rating ? " · ★ " + item.rating.toFixed(1) : ""}</p>
          <div class="anilist-card-genres">${item.genres.slice(0, 4).map(g => `<span class="tag">${g}</span>`).join("")}</div>
          <p class="anilist-card-meta">${item.trailerEmbedUrl ? "🎬 Con tráiler" : "Sin tráiler disponible"}</p>
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
        <small>${a.episodes.length} capítulo${a.episodes.length === 1 ? "" : "s"} · ${a.source === "anilist" ? "AniList" : "Semilla"}</small>
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
    detailEl.innerHTML = `<p class="admin-empty">Selecciona un anime de la lista (o agrega uno nuevo desde AniList arriba) para gestionar sus capítulos.</p>`;
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
        <p class="anilist-card-meta">${anime.year} · ${anime.studio} · ★ ${anime.rating.toFixed(1)}</p>
        <div class="hero-genres">${anime.genres.map(g => `<span class="tag">${g}</span>`).join("")}</div>
        <p class="pill ${anime.trailerEmbedUrl ? "pill-ok" : "pill-warn"}">${anime.trailerEmbedUrl ? "Con tráiler" : "Sin tráiler"}</p>
        <div class="admin-anime-actions">
          <a class="btn btn-ghost btn-sm" href="anime.html?id=${anime.id}" target="_blank" rel="noopener">Ver ficha</a>
          <button class="btn btn-ghost btn-sm" id="delete-anime-btn" type="button">Eliminar anime</button>
        </div>
      </div>
    </div>

    <h4 class="admin-subhead">Tráiler</h4>
    <form class="admin-episode-form" id="trailer-form">
      <label>URL del tráiler (link normal de YouTube/Dailymotion, o una URL de embed)
        <input class="input" type="url" id="trailer-url" value="${escapeAttr(anime.trailerEmbedUrl || "")}" placeholder="https://www.youtube.com/watch?v=xxxxxxxx">
      </label>
      <p class="admin-hint">Pega el link tal cual lo copias del navegador (de YouTube o Dailymotion) — se convierte automáticamente al formato de reproductor. Déjalo vacío y guarda para quitar el tráiler.</p>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar tráiler</button>
      </div>
    </form>

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
      <label>Miniatura del episodio (URL de imagen)
        <input class="input" type="url" id="ep-thumb" value="${editing ? escapeAttr(editing.thumb || "") : ""}" placeholder="https://ejemplo.com/miniaturas/ep1.jpg">
      </label>
      <p class="admin-hint">Pega el link directo a una imagen (termina en .jpg, .png, etc). Déjalo vacío para usar una miniatura de relleno automática.</p>
      <div class="admin-episode-thumb-preview">
        <img id="ep-thumb-preview" src="${editing ? escapeAttr(editing.thumb || "") : ""}" alt="Vista previa de la miniatura" ${editing && editing.thumb ? "" : 'style="display:none"'}>
      </div>
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
  document.querySelector("#trailer-form").addEventListener("submit", handleTrailerSubmit);

  const thumbInput = document.querySelector("#ep-thumb");
  const thumbPreview = document.querySelector("#ep-thumb-preview");
  if (thumbInput && thumbPreview) {
    thumbInput.addEventListener("input", () => {
      const url = thumbInput.value.trim();
      if (url) {
        thumbPreview.src = url;
        thumbPreview.style.display = "";
      } else {
        thumbPreview.removeAttribute("src");
        thumbPreview.style.display = "none";
      }
    });
  }

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
  const thumb = document.querySelector("#ep-thumb").value.trim();

  if (editingEpisodeNumber !== null) {
    updateEpisode(anime.id, editingEpisodeNumber, { title, duration, embedUrl, thumb });
  } else {
    addEpisodeToAnime(anime.id, { number, title, duration, embedUrl, thumb });
  }

  editingEpisodeNumber = null;
  renderAnimeList();
  renderAnimeDetail();
}

function handleTrailerSubmit(e) {
  e.preventDefault();
  const anime = getAnimeById(selectedAnimeId);
  if (!anime) return;

  const rawUrl = document.querySelector("#trailer-url").value.trim();
  const embedUrl = normalizeTrailerUrl(rawUrl);

  updateAnimeTrailer(anime.id, embedUrl);
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

/* Convierte un link normal de YouTube o Dailymotion (el que copias de la
   barra de direcciones) en la URL de "embed" que necesita el <iframe>.
   Si ya es una URL de embed, o es de otro proveedor, se deja tal cual. */
function normalizeTrailerUrl(rawUrl) {
  const url = (rawUrl || "").trim();
  if (!url) return "";

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch" && u.searchParams.get("v")) {
        return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
      }
      if (u.pathname.startsWith("/embed/")) return url; // ya es un embed
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
    }
    if (host === "dailymotion.com") {
      if (u.pathname.startsWith("/embed/")) return url; // ya es un embed
      const match = u.pathname.match(/\/video\/([^_/]+)/);
      if (match) return `https://www.dailymotion.com/embed/video/${match[1]}`;
    }
  } catch (err) {
    // URL inválida: la dejamos tal cual, el navegador simplemente no
    // podrá cargarla en el <iframe> y se mostrará el estado "sin tráiler".
  }

  return url;
}
