/* ============================================================
   FicticionalTV — Catálogo de extras: búsqueda, orden y paginación
   Es un espejo de js/catalogo.js pero sobre EXTRAS_LIST en vez de
   ANIME_LIST, y enlazando a extra.html en vez de anime.html.
   ============================================================ */

const EXTRAS_PAGE_SIZE = 10;
let extrasCurrentPage = 1;

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get("q") || "";

  const searchInput = document.querySelector("#catalog-search");
  const sortSelect = document.querySelector("#sort-select");

  searchInput.value = initialQuery;

  searchInput.addEventListener("input", () => { extrasCurrentPage = 1; renderExtrasCatalog(); });
  sortSelect.addEventListener("change", () => { extrasCurrentPage = 1; renderExtrasCatalog(); });

  // EXTRAS_LIST llega de forma asíncrona desde Firestore, igual que ANIME_LIST.
  onLibraryReady(() => renderExtrasCatalog());
  onLibraryChange(() => renderExtrasCatalog());
});

function renderExtrasCatalog() {
  const query = document.querySelector("#catalog-search").value;
  const sortBy = document.querySelector("#sort-select").value;

  let list = EXTRAS_LIST.filter(x => matchesSearchQuery(x, query));
  list = sortExtrasList(list, sortBy);

  const totalPages = Math.max(1, Math.ceil(list.length / EXTRAS_PAGE_SIZE));
  extrasCurrentPage = Math.min(extrasCurrentPage, totalPages);
  const start = (extrasCurrentPage - 1) * EXTRAS_PAGE_SIZE;
  const pageItems = list.slice(start, start + EXTRAS_PAGE_SIZE);

  const grid = document.querySelector("#catalog-grid");
  const countEl = document.querySelector("#results-count");
  const emptyState = document.querySelector("#empty-state");

  countEl.textContent = `${list.length} resultado${list.length === 1 ? "" : "s"}`;

  if (pageItems.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    grid.innerHTML = pageItems.map(x => extraCardTemplate(x)).join("");
  }

  renderExtrasPagination(totalPages);
}

function sortExtrasList(list, sortBy) {
  const copy = [...list];
  switch (sortBy) {
    case "popularidad":
      return copy.sort((a, b) => (a.popularityRank || 0) - (b.popularityRank || 0));
    case "alfabetico":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "fecha":
    default:
      return copy.sort((a, b) => (b.year || 0) - (a.year || 0));
  }
}

function extraCardTemplate(x) {
  const itemCount = (x.audio || []).length + (x.video || []).length;
  return `
    <a class="card" href="extra.html?id=${x.id}">
      <div class="card-poster">
        <img src="${x.cover}" alt="Portada de ${x.title}" loading="lazy">
        <span class="badge badge-rating">★ ${Number.isFinite(x.rating) ? x.rating.toFixed(1) : "0.0"}</span>
        <div class="card-play"><span class="play-circle">${playIconSvg()}</span></div>
      </div>
      <div class="card-body">
        <h3>${x.title}</h3>
        <div class="card-genres">${(x.genres || []).join(" · ")}${itemCount ? ` · ${itemCount} video${itemCount === 1 ? "" : "s"}` : ""}</div>
      </div>
    </a>
  `;
}

function renderExtrasPagination(totalPages) {
  const el = document.querySelector("#pagination");
  if (totalPages <= 1) { el.innerHTML = ""; return; }

  let html = `<button class="page-btn" data-page="${extrasCurrentPage - 1}" ${extrasCurrentPage === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === extrasCurrentPage ? "is-active" : ""}" data-page="${i}">${i}</button>`;
  }
  html += `<button class="page-btn" data-page="${extrasCurrentPage + 1}" ${extrasCurrentPage === totalPages ? "disabled" : ""} aria-label="Página siguiente">›</button>`;

  el.innerHTML = html;
  el.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      extrasCurrentPage = Number(btn.dataset.page);
      renderExtrasCatalog();
      document.querySelector("#catalog-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
