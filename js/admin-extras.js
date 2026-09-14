/* ============================================================
   FicticionalTV — Panel de administración: Extras
   Espejo de la sección "Mi biblioteca" de js/admin.js, pero para
   EXTRAS_LIST. Un extra no viene de AniList: se crea a mano con un
   formulario simple, y su contenido se organiza en dos listas de
   video independientes, "Audio" y "Video" (ambas son video, el
   nombre es solo la etiqueta de la sección).

   Se inicializa desde js/admin.js (showPanel()) justo después de
   initAdminPanel(), una vez que la sesión quedó autenticada, así
   que puede asumir que ya existe el DOM del panel protegido.
   ============================================================ */

let selectedExtraId = null;
let editingExtraItem = { audio: null, video: null };

function initAdminExtrasPanel() {
  const params = new URLSearchParams(window.location.search);
  if (!selectedExtraId) selectedExtraId = params.get("extra") || null;

  const createForm = document.querySelector("#extra-create-form");
  if (createForm) createForm.addEventListener("submit", handleExtraCreate);

  renderExtrasList();
  renderExtraDetail();

  // Si Firestore confirma el cambio (o llega uno desde otro
  // dispositivo/pestaña), refresca la lista y el detalle.
  onLibraryChange(() => {
    renderExtrasList();
    renderExtraDetail();
  });
}

function handleExtraCreate(e) {
  e.preventDefault();
  const title = document.querySelector("#extra-title").value.trim();
  if (!title) return;

  const record = addExtraToLibrary({
    title,
    synopsis: document.querySelector("#extra-synopsis").value.trim(),
    year: Number(document.querySelector("#extra-year").value) || new Date().getFullYear(),
    rating: Number(document.querySelector("#extra-rating").value) || 0,
    studio: document.querySelector("#extra-studio").value.trim(),
    genres: document.querySelector("#extra-genres").value.split(",").map(g => g.trim()).filter(Boolean),
    cover: document.querySelector("#extra-cover").value.trim(),
    banner: document.querySelector("#extra-banner").value.trim()
  });

  document.querySelector("#extra-create-form").reset();
  selectedExtraId = record.id;
  editingExtraItem = { audio: null, video: null };
  renderExtrasList();
  renderExtraDetail();
  document.querySelector("#admin-extras-detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------------------------
   Lista de extras
   ------------------------------------------------------------ */
function renderExtrasList() {
  const listEl = document.querySelector("#admin-extras-list");
  if (!listEl) return;
  const sorted = [...EXTRAS_LIST].sort((a, b) => a.title.localeCompare(b.title));

  if (!sorted.length) {
    listEl.innerHTML = `<p class="admin-empty">Todavía no has creado ningún extra. Usa el formulario de arriba para agregar el primero.</p>`;
    return;
  }

  listEl.innerHTML = sorted.map(x => `
    <button class="admin-anime-item ${x.id === selectedExtraId ? "is-active" : ""}" data-select="${x.id}">
      <img src="${x.cover}" alt="">
      <span>
        <strong>${x.title}</strong>
        <small>${(x.audio || []).length} audio · ${(x.video || []).length} video</small>
      </span>
    </button>
  `).join("");

  listEl.querySelectorAll("[data-select]").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedExtraId = btn.dataset.select;
      editingExtraItem = { audio: null, video: null };
      renderExtrasList();
      renderExtraDetail();
    });
  });
}

/* ------------------------------------------------------------
   Detalle del extra seleccionado
   ------------------------------------------------------------ */
function renderExtraDetail() {
  const detailEl = document.querySelector("#admin-extras-detail");
  if (!detailEl) return;
  const extra = selectedExtraId ? getExtraById(selectedExtraId) : null;

  if (!extra) {
    detailEl.innerHTML = `<p class="admin-empty">Selecciona un extra de la lista (o crea uno nuevo arriba) para gestionar su audio y video.</p>`;
    return;
  }

  detailEl.innerHTML = `
    <div class="admin-anime-header">
      <img src="${extra.cover}" alt="Portada de ${escapeAttr(extra.title)}">
      <div>
        <h3>${extra.title}</h3>
        <p class="anilist-card-meta">${extra.year} · ${extra.studio} · ★ ${extra.rating.toFixed(1)}</p>
        <div class="hero-genres">${extra.genres.map(g => `<span class="tag">${g}</span>`).join("")}</div>
        <div class="admin-anime-actions">
          <a class="btn btn-ghost btn-sm" href="extra.html?id=${extra.id}" target="_blank" rel="noopener">Ver ficha</a>
          <button class="btn btn-ghost btn-sm" id="delete-extra-btn" type="button">Eliminar extra</button>
        </div>
      </div>
    </div>

    <h4 class="admin-subhead">Información general</h4>
    <form class="admin-episode-form" id="extra-info-form">
      <label>Sinopsis
        <textarea class="input" id="extra-info-synopsis" rows="3">${escapeAttr(extra.synopsis || "")}</textarea>
      </label>
      <label>Estudio
        <input class="input" type="text" id="extra-info-studio" value="${escapeAttr(extra.studio || "")}">
      </label>
      <label>Géneros (separados por coma)
        <input class="input" type="text" id="extra-info-genres" value="${escapeAttr((extra.genres || []).join(", "))}">
      </label>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar información</button>
      </div>
    </form>

    <h4 class="admin-subhead">Imagen de fondo</h4>
    <form class="admin-episode-form" id="extra-banner-form">
      <label>URL de la imagen de fondo
        <input class="input" type="url" id="extra-banner-url-input" value="${escapeAttr(extra.banner || "")}" placeholder="https://ejemplo.com/fondo.jpg">
      </label>
      <div class="admin-episode-thumb-preview">
        <img id="extra-banner-url-preview" src="${escapeAttr(extra.banner || "")}" alt="" ${extra.banner ? "" : 'style="display:none"'}>
      </div>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar imagen de fondo</button>
      </div>
    </form>

    <h4 class="admin-subhead">Logo del extra</h4>
    <form class="admin-episode-form" id="extra-logo-form">
      <label>URL de la imagen del logo
        <input class="input" type="url" id="extra-logo-url-input" value="${escapeAttr(extra.logo || "")}" placeholder="https://ejemplo.com/logo.png">
      </label>
      <div class="admin-logo-preview">
        <img id="extra-logo-url-preview" src="${escapeAttr(extra.logo || "")}" alt="" ${extra.logo ? "" : 'style="display:none"'}>
        <span class="admin-empty" id="extra-logo-empty-hint" ${extra.logo ? 'style="display:none"' : ""}>Sin logo — se muestra el título de texto</span>
      </div>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">Guardar logo</button>
        ${extra.logo ? `<button class="btn btn-ghost btn-sm" type="button" id="extra-remove-logo-btn">Quitar logo</button>` : ""}
      </div>
    </form>

    ${extraItemManagerHtml(extra, "audio")}
    ${extraItemManagerHtml(extra, "video")}
  `;

  wireExtraDetailForms(extra);
  wireExtraItemManager(extra, "audio");
  wireExtraItemManager(extra, "video");
}

/* Genera el HTML del formulario + lista para una de las dos secciones
   (kind = "audio" o "video"). Los ids llevan el prefijo del kind para
   no chocar entre sí cuando ambos bloques están en la misma página. */
function extraItemManagerHtml(extra, kind) {
  const label = kind === "audio" ? "Audio" : "Video";
  const items = [...(kind === "audio" ? extra.audio : extra.video)].sort((a, b) => a.number - b.number);
  const editing = editingExtraItem[kind] !== null ? items.find(i => i.number === editingExtraItem[kind]) : null;
  const nextNumber = items.length ? Math.max(...items.map(i => i.number)) + 1 : 1;

  return `
    <h4 class="admin-subhead">${editing ? `Editando ${label.toLowerCase()} ${editing.number}` : `Agregar a ${label}`}</h4>
    <form class="admin-episode-form" id="extra-${kind}-form" data-kind="${kind}">
      <div class="form-row">
        <label>N.º
          <input class="input" type="number" min="1" id="extra-${kind}-number" value="${editing ? editing.number : nextNumber}" ${editing ? "disabled" : ""} required>
        </label>
        <label>Duración
          <input class="input" type="text" id="extra-${kind}-duration" value="${editing ? escapeAttr(editing.duration) : "23 min"}" placeholder="23 min">
        </label>
      </div>
      <label>Título
        <input class="input" type="text" id="extra-${kind}-title" value="${editing ? escapeAttr(editing.title) : ""}" placeholder="Ej. Detrás de cámaras" required>
      </label>
      <label>URL del reproductor (link normal de YouTube/Dailymotion/Vimeo, o una URL de embed)
        <input class="input" type="url" id="extra-${kind}-embed" value="${editing ? escapeAttr(editing.embedUrl || "") : ""}" placeholder="https://www.youtube.com/watch?v=xxxxxxxx">
      </label>
      <label>Miniatura (URL de imagen)
        <input class="input" type="url" id="extra-${kind}-thumb" value="${editing ? escapeAttr(editing.thumb || "") : ""}" placeholder="https://ejemplo.com/miniatura.jpg">
      </label>
      <div class="admin-episode-thumb-preview">
        <img id="extra-${kind}-thumb-preview" src="${editing ? escapeAttr(editing.thumb || "") : ""}" alt="" ${editing && editing.thumb ? "" : 'style="display:none"'}>
      </div>
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="submit">${editing ? "Guardar cambios" : `Agregar a ${label}`}</button>
        ${editing ? `<button class="btn btn-ghost btn-sm" type="button" id="extra-${kind}-cancel-btn">Cancelar</button>` : ""}
      </div>
    </form>

    <h4 class="admin-subhead">${label} (${items.length})</h4>
    <div class="admin-episode-list" id="extra-${kind}-list">
      ${items.length ? items.map(item => `
        <div class="admin-episode-row">
          <img src="${item.thumb}" alt="">
          <div class="admin-episode-info">
            <strong>${kind === "audio" ? "A" : "V"}${item.number} · ${item.title}</strong>
            <span class="pill ${item.embedUrl ? "pill-ok" : "pill-warn"}">${item.embedUrl ? "Con reproductor" : "Sin reproductor"}</span>
          </div>
          <div class="admin-episode-actions">
            <a class="btn btn-ghost btn-sm" href="capitulo.html?extra=${extra.id}&type=${kind}&num=${item.number}" target="_blank" rel="noopener">Ver</a>
            <button class="btn btn-ghost btn-sm" type="button" data-edit="${item.number}">Editar</button>
            <button class="btn btn-ghost btn-sm" type="button" data-delete="${item.number}">Eliminar</button>
          </div>
        </div>
      `).join("") : `<p class="admin-empty">Todavía no hay contenido de ${label.toLowerCase()} para este extra.</p>`}
    </div>
  `;
}

/* Conecta los formularios generales (info, banner, logo) del extra
   seleccionado. */
function wireExtraDetailForms(extra) {
  const infoForm = document.querySelector("#extra-info-form");
  if (infoForm) {
    infoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      updateExtraDetails(extra.id, {
        synopsis: document.querySelector("#extra-info-synopsis").value,
        studio: document.querySelector("#extra-info-studio").value.trim(),
        genres: document.querySelector("#extra-info-genres").value.split(",").map(g => g.trim()).filter(Boolean)
      });
      renderExtraDetail();
      renderExtrasList();
    });
  }

  const bannerForm = document.querySelector("#extra-banner-form");
  if (bannerForm) {
    bannerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      updateExtraBanner(extra.id, document.querySelector("#extra-banner-url-input").value.trim());
      renderExtraDetail();
    });
  }
  wireImagePreview("extra-banner-url-input", "extra-banner-url-preview");

  const logoForm = document.querySelector("#extra-logo-form");
  if (logoForm) {
    logoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      updateExtraLogo(extra.id, document.querySelector("#extra-logo-url-input").value.trim());
      renderExtraDetail();
    });
  }
  wireImagePreview("extra-logo-url-input", "extra-logo-url-preview", "extra-logo-empty-hint");
  const removeLogoBtn = document.querySelector("#extra-remove-logo-btn");
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener("click", () => {
      if (!confirm("¿Quitar el logo? Volverá a mostrarse el título de texto.")) return;
      updateExtraLogo(extra.id, null);
      renderExtraDetail();
    });
  }

  const deleteBtn = document.querySelector("#delete-extra-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`¿Eliminar "${extra.title}" y todo su contenido? Esta acción no se puede deshacer.`)) return;
      removeExtraFromLibrary(extra.id);
      selectedExtraId = null;
      editingExtraItem = { audio: null, video: null };
      renderExtrasList();
      renderExtraDetail();
    });
  }
}

/* Conecta el formulario + lista de una sección (audio o video). */
function wireExtraItemManager(extra, kind) {
  const form = document.querySelector(`#extra-${kind}-form`);
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const number = Number(document.querySelector(`#extra-${kind}-number`).value);
    const title = document.querySelector(`#extra-${kind}-title`).value.trim();
    const duration = document.querySelector(`#extra-${kind}-duration`).value.trim();
    const embedUrl = document.querySelector(`#extra-${kind}-embed`).value.trim();
    const thumb = document.querySelector(`#extra-${kind}-thumb`).value.trim();

    if (editingExtraItem[kind] !== null) {
      updateExtraItem(extra.id, kind, editingExtraItem[kind], { title, duration, embedUrl, thumb });
    } else {
      addExtraItem(extra.id, kind, { number, title, duration, embedUrl, thumb });
    }

    editingExtraItem[kind] = null;
    renderExtrasList();
    renderExtraDetail();
  });

  const thumbInput = document.querySelector(`#extra-${kind}-thumb`);
  const thumbPreview = document.querySelector(`#extra-${kind}-thumb-preview`);
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

  const cancelBtn = document.querySelector(`#extra-${kind}-cancel-btn`);
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      editingExtraItem[kind] = null;
      renderExtraDetail();
    });
  }

  const listEl = document.querySelector(`#extra-${kind}-list`);
  if (listEl) {
    listEl.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        editingExtraItem[kind] = Number(btn.dataset.edit);
        renderExtraDetail();
        document.querySelector(`#extra-${kind}-form`).scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    listEl.querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", () => {
        const number = Number(btn.dataset.delete);
        if (!confirm(`¿Eliminar este elemento de ${kind === "audio" ? "audio" : "video"}?`)) return;
        removeExtraItem(extra.id, kind, number);
        if (editingExtraItem[kind] === number) editingExtraItem[kind] = null;
        renderExtrasList();
        renderExtraDetail();
      });
    });
  }
}
