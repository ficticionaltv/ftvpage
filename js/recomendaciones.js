/* ============================================================
   FicticionalTV — Recomendaciones: catálogo ordenado ÚNICAMENTE
   por calificación (de mayor a menor). A diferencia de catalogo.js,
   esta vista no tiene selector de orden: el criterio es siempre el
   mismo, así que solo se permite buscar dentro del listado.
   ============================================================ */

const RECO_PAGE_SIZE = 10;
let recoCurrentPage = 1;

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.querySelector("#reco-search");
  searchInput.addEventListener("input", () => { recoCurrentPage = 1; renderRecommendations(); });

  // ANIME_LIST llega de forma asíncrona desde Firestore.
  onLibraryReady(() => renderRecommendations());
  onLibraryChange(() => renderRecommendations());
});

function renderRecommendations() {
  const query = document.querySelector("#reco-search").value;

  let list = ANIME_LIST.filter(a => matchesSearchQuery(a, query));

  // Único criterio de orden permitido en esta vista: calificación, de
  // mayor a menor. A calificación igual, desempata el más reciente.
  list = [...list].sort((a, b) => (b.rating - a.rating) || (b.year - a.year));

  const totalPages = Math.max(1, Math.ceil(list.length / RECO_PAGE_SIZE));
  recoCurrentPage = Math.min(recoCurrentPage, totalPages);
  const start = (recoCurrentPage - 1) * RECO_PAGE_SIZE;
  const pageItems = list.slice(start, start + RECO_PAGE_SIZE);

  const grid = document.querySelector("#reco-grid");
  const countEl = document.querySelector("#reco-results-count");
  const emptyState = document.querySelector("#reco-empty-state");

  countEl.textContent = `${list.length} resultado${list.length === 1 ? "" : "s"}`;

  if (pageItems.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    grid.innerHTML = pageItems.map((a, i) => cardTemplate(a, { badge: start + i === 0 ? "N.º 1" : "" })).join("");
  }

  renderRecoPagination(totalPages);
}

function renderRecoPagination(totalPages) {
  const el = document.querySelector("#reco-pagination");
  if (totalPages <= 1) { el.innerHTML = ""; return; }

  let html = `<button class="page-btn" data-page="${recoCurrentPage - 1}" ${recoCurrentPage === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === recoCurrentPage ? "is-active" : ""}" data-page="${i}">${i}</button>`;
  }
  html += `<button class="page-btn" data-page="${recoCurrentPage + 1}" ${recoCurrentPage === totalPages ? "disabled" : ""} aria-label="Página siguiente">›</button>`;

  el.innerHTML = html;
  el.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      recoCurrentPage = Number(btn.dataset.page);
      renderRecommendations();
      document.querySelector("#reco-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
