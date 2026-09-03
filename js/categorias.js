/* ============================================================
   FicticionalTV — Categorías: grid de géneros + resultados dinámicos
   ============================================================ */

let activeGenre = null;

document.addEventListener("DOMContentLoaded", () => {
  renderGenreGrid();
  const params = new URLSearchParams(window.location.search);
  const preset = params.get("genero");
  if (preset && GENRES.includes(preset)) {
    selectGenre(preset);
  }
});

function renderGenreGrid() {
  const grid = document.querySelector("#genre-grid");
  grid.innerHTML = GENRES.map(g => `
    <button class="genre-card" data-genre="${g}">
      <span>${g}</span>
    </button>
  `).join("");

  grid.querySelectorAll("[data-genre]").forEach(btn => {
    btn.addEventListener("click", () => selectGenre(btn.dataset.genre));
  });
}

function selectGenre(genre) {
  activeGenre = genre;

  document.querySelectorAll("#genre-grid .genre-card").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.genre === genre);
  });

  const results = ANIME_LIST.filter(a => a.genres.includes(genre));
  const section = document.querySelector("#results-section");
  const heading = document.querySelector("#results-heading");
  const grid = document.querySelector("#results-grid");
  const emptyState = document.querySelector("#results-empty");

  section.style.display = "block";
  heading.textContent = `${genre} (${results.length})`;

  if (results.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    grid.innerHTML = results.map(a => cardTemplate(a, { badge: a.recent ? "Nuevo" : "" })).join("");
  }

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}
