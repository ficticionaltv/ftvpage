/* ============================================================
   FicticionalTV — Catálogo: búsqueda, orden y paginación
   ============================================================ */

const PAGE_SIZE = 10;
let currentPage = 1;

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get("q") || "";

  const searchInput = document.querySelector("#catalog-search");
  const sortSelect = document.querySelector("#sort-select");

  searchInput.value = initialQuery;

  searchInput.addEventListener("input", () => { currentPage = 1; render(); });
  sortSelect.addEventListener("change", () => { currentPage = 1; render(); });

  // ANIME_LIST llega de forma asíncrona desde Firestore.
  onLibraryReady(() => render());
  onLibraryChange(() => render());
});

function render() {
  const query = document.querySelector("#catalog-search").value;
  const sortBy = document.querySelector("#sort-select").value;

  let list = ANIME_LIST.filter(a => matchesSearchQuery(a, query));

  list = sortList(list, sortBy);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  const grid = document.querySelector("#catalog-grid");
  const countEl = document.querySelector("#results-count");
  const emptyState = document.querySelector("#empty-state");

  countEl.textContent = `${list.length} resultado${list.length === 1 ? "" : "s"}`;

  if (pageItems.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    grid.innerHTML = pageItems.map(a => cardTemplate(a, { badge: a.recent ? "Nuevo" : "" })).join("");
  }

  renderPagination(totalPages);
}

function sortList(list, sortBy) {
  const copy = [...list];
  switch (sortBy) {
    case "popularidad":
      return copy.sort((a, b) => a.popularityRank - b.popularityRank);
    case "alfabetico":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "fecha":
    default:
      return copy.sort((a, b) => b.year - a.year);
  }
}

function renderPagination(totalPages) {
  const el = document.querySelector("#pagination");
  if (totalPages <= 1) { el.innerHTML = ""; return; }

  let html = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? "is-active" : ""}" data-page="${i}">${i}</button>`;
  }
  html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="Página siguiente">›</button>`;

  el.innerHTML = html;
  el.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPage = Number(btn.dataset.page);
      render();
      document.querySelector("#catalog-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
