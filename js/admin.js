/* ============================================================
   FicticionalTV — Panel de administración
   - Protegido con Firebase Authentication (correo/contraseña y
     Google). Solo las cuentas listadas en ADMIN_EMAILS pueden ver
     el panel; esto es una comodidad de interfaz para dar un mensaje
     claro cuanto antes, NO la protección real de los datos.
   - La protección real vive en las Reglas de seguridad de Firestore
     (consola de Firebase → Firestore Database → Reglas), que deben
     exigir request.auth != null y el correo autorizado antes de
     permitir escribir en la colección "ficticionaltv". Sin esas
     reglas, cualquiera que conozca la configuración del proyecto
     podría seguir escribiendo directamente contra la API de
     Firestore, sin pasar por este formulario. Ver el bloque de
     reglas de ejemplo al final de este archivo.
   - Busca animes en AniList API y los agrega a la biblioteca.
   - Permite crear, editar y eliminar capítulos (con su embed).
   ============================================================ */

/* Lista de correos autorizados para entrar al panel. Edítala con
   las cuentas de Google/Firebase que sí deben tener acceso.
   IMPORTANTE: esta lista es solo para mostrar el mensaje de error
   correcto en el navegador. Debes replicarla en las Reglas de
   seguridad de Firestore para que sea una restricción real. */
const ADMIN_EMAILS = [
  // "tu-correo-admin@gmail.com",
];

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
  const emailInput = document.querySelector("#admin-auth-email");
  const passwordInput = document.querySelector("#admin-auth-password");
  const error = document.querySelector("#admin-auth-error");
  const submitBtn = document.querySelector("#admin-auth-submit");
  const googleBtn = document.querySelector("#admin-auth-google");
  const logoutBtn = document.querySelector("#admin-logout-btn");

  let panelInitialized = false;

  function isAuthorized(user) {
    if (!ADMIN_EMAILS.length) return true; // sin lista configurada: cualquier cuenta que inicie sesión pasa (protege igual el candado real, que son las Reglas de Firestore)
    const email = (user.email || "").toLowerCase();
    return ADMIN_EMAILS.some(e => e.toLowerCase() === email);
  }

  function showGate() {
    if (gate) gate.style.display = "";
    if (protectedRoot) protectedRoot.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (emailInput) setTimeout(() => emailInput.focus(), 50);
  }

  function showPanel() {
    if (gate) gate.style.display = "none";
    if (protectedRoot) protectedRoot.style.display = "";
    if (logoutBtn) logoutBtn.style.display = "";
    if (!panelInitialized) {
      panelInitialized = true;
      // ANIME_LIST llega de forma asíncrona desde Firestore.
      onLibraryReady(() => initAdminPanel());
    }
  }

  auth.onAuthStateChanged((user) => {
    if (!user) {
      panelInitialized = false;
      showGate();
      return;
    }
    if (!isAuthorized(user)) {
      if (error) error.textContent = "Esta cuenta no tiene permisos de administrador.";
      auth.signOut();
      return;
    }
    if (error) error.textContent = "";
    showPanel();
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (error) error.textContent = "";
      const email = (emailInput.value || "").trim();
      const password = passwordInput.value || "";
      if (!email || !password) return;

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = "Ingresando…";
      try {
        await auth.signInWithEmailAndPassword(email, password);
        form.reset();
      } catch (err) {
        if (error) error.textContent = describeAuthError(err);
        passwordInput.value = "";
        passwordInput.focus();
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      if (error) error.textContent = "";
      googleBtn.disabled = true;
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
      } catch (err) {
        if (error) error.textContent = describeAuthError(err);
      } finally {
        googleBtn.disabled = false;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      auth.signOut();
    });
  }
});

function describeAuthError(err) {
  const code = err && err.code;
  switch (code) {
    case "auth/invalid-email":
      return "Ese correo no es válido.";
    case "auth/user-disabled":
      return "Esta cuenta fue deshabilitada.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Correo o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos fallidos. Espera un momento e inténtalo de nuevo.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Se cerró la ventana de Google antes de terminar el inicio de sesión.";
    case "auth/popup-blocked":
      return "El navegador bloqueó la ventana emergente de Google. Permite pop-ups para este sitio e inténtalo de nuevo.";
    case "auth/network-request-failed":
      return "Fallo de red. Revisa tu conexión e inténtalo de nuevo.";
    case "auth/operation-not-allowed":
      return "Este método de acceso no está habilitado en Firebase Authentication.";
    default:
      console.error(err);
      return "No se pudo iniciar sesión. Intenta de nuevo.";
  }
}

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
      openAddEditor(item);
    });
  });
}

/* ------------------------------------------------------------
   Editor previo a guardar: muestra los datos que trajo AniList
   pero permite corregirlos (título, sinopsis, portada, fondo,
   año, calificación, estudio, géneros) antes de que queden
   guardados en Firestore para todo el mundo.
   ------------------------------------------------------------ */
function openAddEditor(item) {
  const container = document.querySelector("#anilist-edit-container");
  if (!container) return;

  container.innerHTML = `
    <div class="admin-section anilist-edit-card">
      <h3 class="admin-subhead">Revisa los datos antes de agregarlo</h3>
      <p class="admin-hint">Esto es lo que devolvió AniList para "${escapeAttr(item.title)}". Corrige lo que haga falta (por ejemplo, si la sinopsis viene en inglés o el fondo no te convence) antes de guardarlo en la biblioteca.</p>
      <form class="admin-episode-form" id="anilist-edit-form">
        <label>Título
          <input class="input" type="text" id="edit-title" value="${escapeAttr(item.title)}" required>
        </label>
        <label>Sinopsis
          <textarea class="input" id="edit-synopsis" rows="4">${escapeAttr(item.synopsis || "")}</textarea>
        </label>
        <div class="form-row">
          <label>Año
            <input class="input" type="number" id="edit-year" value="${item.year || new Date().getFullYear()}">
          </label>
          <label>Calificación (0 a 10)
            <input class="input" type="number" step="0.1" min="0" max="10" id="edit-rating" value="${item.rating || 0}">
          </label>
        </div>
        <label>Estudio
          <input class="input" type="text" id="edit-studio" value="${escapeAttr(item.studio || "")}">
        </label>
        <label>Géneros (separados por coma)
          <input class="input" type="text" id="edit-genres" value="${escapeAttr((item.genres || []).join(", "))}">
        </label>
        <label>Portada — imagen vertical (URL)
          <input class="input" type="url" id="edit-cover" value="${escapeAttr(item.cover || "")}">
        </label>
        <div class="admin-episode-thumb-preview">
          <img id="edit-cover-preview" src="${escapeAttr(item.cover || "")}" alt="" ${item.cover ? "" : 'style="display:none"'}>
        </div>
        <label>Imagen de fondo / banner (URL)
          <input class="input" type="url" id="edit-banner" value="${escapeAttr(item.banner || "")}">
        </label>
        <div class="admin-episode-thumb-preview">
          <img id="edit-banner-preview" src="${escapeAttr(item.banner || "")}" alt="" ${item.banner ? "" : 'style="display:none"'}>
        </div>
        <p class="admin-hint">El logo del anime (para mostrar en vez del título) se sube después, ya guardado, desde su ficha en "Mi biblioteca".</p>
        <div class="admin-anime-actions">
          <button class="btn btn-primary btn-sm" type="submit">Guardar en biblioteca</button>
          <button class="btn btn-ghost btn-sm" type="button" id="cancel-add-btn">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  wireImagePreview("edit-cover", "edit-cover-preview");
  wireImagePreview("edit-banner", "edit-banner-preview");

  document.querySelector("#cancel-add-btn").addEventListener("click", () => {
    container.innerHTML = "";
  });

  document.querySelector("#anilist-edit-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const edited = {
      ...item,
      title: document.querySelector("#edit-title").value.trim() || item.title,
      synopsis: document.querySelector("#edit-synopsis").value.trim(),
      year: Number(document.querySelector("#edit-year").value) || item.year,
      rating: Number(document.querySelector("#edit-rating").value) || 0,
      studio: document.querySelector("#edit-studio").value.trim() || item.studio,
      genres: document.querySelector("#edit-genres").value.split(",").map(g => g.trim()).filter(Boolean),
      cover: document.querySelector("#edit-cover").value.trim() || item.cover,
      banner: document.querySelector("#edit-banner").value.trim() || item.banner
    };

    const record = addAnimeToLibrary(edited);
    container.innerHTML = "";
    selectedAnimeId = record.id;
    editingEpisodeNumber = null;
    renderAnimeList();
    renderAnimeDetail();
    renderSearchResults();
    document.querySelector("#admin-anime-detail").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Conecta un input de URL de imagen con su <img> de vista previa.
   emptyHintId (opcional) es un elemento que se muestra cuando el campo
   está vacío (por ejemplo, el aviso "sin logo" en la sección de logo). */
function wireImagePreview(inputId, previewId, emptyHintId) {
  const input = document.querySelector(`#${inputId}`);
  const preview = document.querySelector(`#${previewId}`);
  const emptyHint = emptyHintId ? document.querySelector(`#${emptyHintId}`) : null;
  if (!input || !preview) return;
  input.addEventListener("input", () => {
    const url = input.value.trim();
    if (url) {
      preview.src = url;
      preview.style.display = "";
      if (emptyHint) emptyHint.style.display = "none";
    } else {
      preview.removeAttribute("src");
      preview.style.display = "none";
      if (emptyHint) emptyHint.style.display = "";
    }
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

    <h4 class="admin-subhead">Imagen de fondo</h4>
    <p class="admin-hint">Esta es la imagen ancha que se usa como fondo en el slider de inicio y arriba de la ficha del anime. Trae la que encontró AniList por defecto, pero puedes pegar otro link si no te convence.</p>
    <form class="admin-episode-form" id="banner-form">
      <label>URL de la imagen de fondo
        <input class="input" type="url" id="banner-url-input" value="${escapeAttr(anime.banner || "")}" placeholder="https://ejemplo.com/fondos/mi-anime.jpg">
      </label>
      <div class="admin-episode-thumb-preview">
        <img id="banner-url-preview" src="${escapeAttr(anime.banner || "")}" alt="" ${anime.banner ? "" : 'style="display:none"'}>
      </div>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar imagen de fondo</button>
      </div>
    </form>

    <h4 class="admin-subhead">Logo del anime</h4>
    <p class="admin-hint">Pega el link directo a una imagen del logo/isotipo (fondo transparente, PNG recomendado — por ejemplo, subida a imgur, tu propio hosting, etc). Si lo agregas, reemplaza el título de texto en el slider del inicio y en la ficha del anime.</p>
    <form class="admin-episode-form" id="logo-form">
      <label>URL de la imagen del logo
        <input class="input" type="url" id="logo-url-input" value="${escapeAttr(anime.logo || "")}" placeholder="https://ejemplo.com/logos/mi-anime.png">
      </label>
      <div class="admin-logo-preview">
        <img id="logo-url-preview" src="${escapeAttr(anime.logo || "")}" alt="" ${anime.logo ? "" : 'style="display:none"'}>
        <span class="admin-empty" id="logo-empty-hint" ${anime.logo ? 'style="display:none"' : ""}>Sin logo — se muestra el título de texto</span>
      </div>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar logo</button>
        ${anime.logo ? `<button class="btn btn-ghost btn-sm" type="button" id="remove-logo-btn">Quitar logo</button>` : ""}
      </div>
    </form>

    <h4 class="admin-subhead">Tráiler</h4>
    <form class="admin-episode-form" id="trailer-form">
      <label>URL del tráiler (link normal de YouTube/Dailymotion/Vimeo, o una URL de embed)
        <input class="input" type="url" id="trailer-url" value="${escapeAttr(anime.trailerEmbedUrl || "")}" placeholder="https://www.youtube.com/watch?v=xxxxxxxx">
      </label>
      <p class="admin-hint">Pega el link tal cual lo copias del navegador (YouTube, Dailymotion, Vimeo) — se convierte automáticamente al formato de reproductor. Déjalo vacío y guarda para quitar el tráiler.</p>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar tráiler</button>
      </div>
    </form>

    <h4 class="admin-subhead">Información de la ficha</h4>
    <form class="admin-episode-form" id="info-form">
      <label>Audio
        <input class="input" type="text" id="info-audio-input" value="${escapeAttr(anime.audio || "")}" placeholder="Ej. Español Latino, Japonés (Subtitulado)">
      </label>
      <label>Reparto
        <input class="input" type="text" id="info-cast-input" value="${escapeAttr(anime.cast || "")}" placeholder="Ej. Nombre del actor de voz (Personaje)">
      </label>
      <p class="admin-hint">Estos campos aparecen en la ficha del anime, debajo de la sinopsis. El género y el estudio se toman automáticamente de los datos de arriba.</p>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar información</button>
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
      <label>URL del reproductor (link normal de YouTube/Dailymotion/Vimeo, o una URL de embed)
        <input class="input" type="url" id="ep-embed" value="${editing ? escapeAttr(editing.embedUrl || "") : ""}" placeholder="https://www.youtube.com/watch?v=xxxxxxxx">
      </label>
      <p class="admin-hint">Pega el link tal cual lo copias del navegador (YouTube, Dailymotion, Vimeo) — se convierte automáticamente al formato de reproductor. Si tu proveedor de video es otro, pega directamente la URL de "embed" que te dé. Puedes dejarlo vacío y completarlo después.</p>
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
  document.querySelector("#info-form").addEventListener("submit", handleInfoSubmit);

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

  const bannerForm = document.querySelector("#banner-form");
  if (bannerForm) {
    bannerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const url = document.querySelector("#banner-url-input").value.trim();
      updateAnimeBanner(anime.id, url);
      renderAnimeDetail();
    });
  }
  wireImagePreview("banner-url-input", "banner-url-preview");

  const logoForm = document.querySelector("#logo-form");
  if (logoForm) {
    logoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const url = document.querySelector("#logo-url-input").value.trim();
      updateAnimeLogo(anime.id, url);
      renderAnimeDetail();
    });
  }
  wireImagePreview("logo-url-input", "logo-url-preview", "logo-empty-hint");
  const removeLogoBtn = document.querySelector("#remove-logo-btn");
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener("click", () => {
      if (!confirm("¿Quitar el logo? Volverá a mostrarse el título de texto.")) return;
      updateAnimeLogo(anime.id, null);
      renderAnimeDetail();
    });
  }

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

  // updateAnimeTrailer() (js/store.js) se encarga de convertir el link
  // pegado (YouTube, Dailymotion, Vimeo, etc.) al formato de "embed"
  // que necesita el <iframe>, así que aquí solo lo pasamos tal cual.
  updateAnimeTrailer(anime.id, rawUrl);
  renderAnimeDetail();
}

function handleInfoSubmit(e) {
  e.preventDefault();
  const anime = getAnimeById(selectedAnimeId);
  if (!anime) return;

  const audio = document.querySelector("#info-audio-input").value.trim();
  const cast = document.querySelector("#info-cast-input").value.trim();

  updateAnimeInfo(anime.id, { audio, cast });
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

/* ============================================================
   REGLAS DE SEGURIDAD DE FIRESTORE (acción manual requerida)
   ------------------------------------------------------------
   Todo lo de arriba solo controla qué ve el NAVEGADOR. Firestore
   sigue expuesto a través de su API pública con la firebaseConfig
   de js/firebase-config.js (esos valores no son secretos, están
   pensados para ser públicos), así que cualquiera podría seguir
   escribiendo directo en la base de datos si las Reglas de
   Firestore no lo impiden.

   Para que la autenticación de arriba sea seguridad real y no solo
   una pantalla de acceso, ve a la consola de Firebase → tu proyecto
   → Firestore Database → pestaña "Reglas", y usa algo como esto
   (ajusta la lista de correos a los mismos de ADMIN_EMAILS):

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /ficticionaltv/library {
         allow read: if true;
         allow write: if request.auth != null &&
           request.auth.token.email in [
             "tu-correo-admin@gmail.com"
           ];
       }
     }
   }

   Publica esas reglas después de crear el usuario correo/contraseña
   (o de iniciar sesión una vez con Google) en Firebase Authentication.
   Sin este paso, el candado de este archivo es solo cosmético.
   ============================================================ */
