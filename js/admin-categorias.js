/* ============================================================
   FicticionalTV — Panel de administración: imágenes de categorías
   Una tarjeta por cada género de GENRES (js/data.js) con un campo de
   URL, vista previa en vivo y botones Guardar / Quitar imagen. La
   imagen se guarda con setGenreImage() (js/store.js) en el mismo
   documento de Firestore que los animes y los extras, y se muestra
   en la página Categorías (categorias.html).

   Se inicializa desde js/admin.js (showPanel()) cuando la sesión ya
   está autenticada y la biblioteca cargó.
   ============================================================ */

function initAdminCategoriesPanel() {
  const host = document.querySelector("#admin-genres-grid");
  if (!host) return;

  host.innerHTML = GENRES.map(g => `
    <div class="admin-genre-card" data-genre="${escapeAttr(g)}">
      <div class="admin-genre-preview"><span>${escapeAttr(g)}</span></div>
      <input class="input" type="url" placeholder="https://ejemplo.com/imagen.jpg" aria-label="URL de la imagen de ${escapeAttr(g)}" data-saved="">
      <div class="admin-anime-actions">
        <button class="btn btn-primary btn-sm" type="button" data-save>Guardar</button>
        <button class="btn btn-ghost btn-sm" type="button" data-clear>Quitar imagen</button>
      </div>
      <div class="admin-genre-status" role="status" aria-live="polite"></div>
    </div>
  `).join("");

  [...host.children].forEach(card => {
    const genre = card.dataset.genre;
    const input = card.querySelector("input");

    // Vista previa en vivo mientras se escribe la URL.
    input.addEventListener("input", () => {
      setGenreStatus(card, "", "");
      paintGenrePreview(card, input.value.trim());
    });

    card.querySelector("[data-save]").addEventListener("click", () => {
      const url = input.value.trim();
      if (url && !/^https?:\/\//i.test(url)) {
        setGenreStatus(card, "La URL debe empezar con http:// o https://", "is-error");
        return;
      }
      if (!setGenreImage(genre, url)) {
        setGenreStatus(card, "No se pudo guardar esa URL.", "is-error");
        return;
      }
      input.dataset.saved = url;
      setGenreStatus(card, url ? "Guardado ✓" : "Imagen quitada ✓", "is-ok");
    });

    card.querySelector("[data-clear]").addEventListener("click", () => {
      input.value = "";
      paintGenrePreview(card, "");
      setGenreImage(genre, "");
      input.dataset.saved = "";
      setGenreStatus(card, "Imagen quitada ✓", "is-ok");
    });
  });

  syncAdminGenreCards();
  // Si la biblioteca cambia (otro dispositivo, o nuestro propio guardado),
  // actualizamos solo las tarjetas que no se estén editando.
  onLibraryChange(syncAdminGenreCards);
}

/* Refleja en cada tarjeta lo guardado, sin pisar lo que se esté escribiendo. */
function syncAdminGenreCards() {
  const host = document.querySelector("#admin-genres-grid");
  if (!host) return;
  [...host.children].forEach(card => {
    const input = card.querySelector("input");
    const saved = getGenreImage(card.dataset.genre) || "";
    const dirty = input.value.trim() !== (input.dataset.saved || "");
    if (dirty) return;
    input.value = saved;
    input.dataset.saved = saved;
    paintGenrePreview(card, saved);
  });
}

function paintGenrePreview(card, url) {
  const preview = card.querySelector(".admin-genre-preview");
  const valid = url && /^https?:\/\//i.test(url);
  preview.classList.toggle("has-image", !!valid);
  preview.style.backgroundImage = valid ? cssUrl(url) : "";
}

function setGenreStatus(card, text, cls) {
  const el = card.querySelector(".admin-genre-status");
  el.textContent = text;
  el.className = "admin-genre-status" + (cls ? " " + cls : "");
}
