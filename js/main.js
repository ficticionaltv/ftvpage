/* ============================================================
   FicticionalTV — comportamiento compartido (header, hero slider)
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initHeaderScroll();
  initMobileNav();
  initHeaderSearch();
  // El slider depende de ANIME_LIST, que ahora llega de forma asíncrona
  // desde Firestore: se renderiza en cuanto está lista y se vuelve a
  // renderizar si otro dispositivo cambia la biblioteca.
  onLibraryReady(() => initHeroSlider());
  onLibraryChange(() => initHeroSlider());
});

/* Header: sombra/fondo sólido al hacer scroll */
function initHeaderScroll() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* Menú móvil */
function initMobileNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

/* Buscador del header: redirige al catálogo con la consulta */
function initHeaderSearch() {
  const form = document.querySelector("[data-header-search]");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = form.querySelector("input").value.trim();
    window.location.href = `catalogo.html${q ? "?q=" + encodeURIComponent(q) : ""}`;
  });
}

/* ------------------------------------------------------------
   Hero slider (home)
   ------------------------------------------------------------ */
let heroTimer = null;

function initHeroSlider() {
  const hero = document.querySelector("[data-hero]");
  if (!hero || typeof ANIME_LIST === "undefined") return;

  // Si ya había un slider corriendo (por ejemplo, se está re-renderizando
  // porque llegó una actualización de Firestore), evita duplicar el timer.
  if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }

  const featured = ANIME_LIST.slice(0, 5);
  const slidesEl = hero.querySelector(".hero-slides");
  const dotsEl = hero.querySelector(".hero-dots");

  slidesEl.innerHTML = featured.map((a, i) => `
    <div class="hero-slide ${i === 0 ? "is-active" : ""}" data-index="${i}">
      <div class="hero-slide-bg" style="background-image:url('${a.banner}')"></div>
      <div class="hero-content">
        <div class="hero-genres">
          ${a.genres.map(g => `<span class="tag">${g}</span>`).join("")}
        </div>
        <h1 class="hero-title">${a.title}</h1>
        <div class="hero-rating">
          <span class="stars">${starString(a.rating)}</span>
          <span>${a.rating.toFixed(1)} · ${a.year}</span>
        </div>
        <p class="hero-synopsis">${a.synopsis}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="anime.html?id=${a.id}">Ver ahora</a>
          <a class="btn btn-ghost" href="anime.html?id=${a.id}">Más información</a>
        </div>
      </div>
    </div>
  `).join("");

  dotsEl.innerHTML = featured.map((_, i) => `
    <button class="hero-dot ${i === 0 ? "is-active" : ""}" data-dot="${i}" aria-label="Ir a la diapositiva ${i + 1}"></button>
  `).join("");

  let current = 0;
  const slides = slidesEl.querySelectorAll(".hero-slide");
  const dots = dotsEl.querySelectorAll(".hero-dot");

  function goTo(index) {
    slides[current].classList.remove("is-active");
    dots[current].classList.remove("is-active");
    current = (index + slides.length) % slides.length;
    slides[current].classList.add("is-active");
    dots[current].classList.add("is-active");
  }

  dots.forEach((dot, i) => dot.addEventListener("click", () => { goTo(i); resetTimer(); }));

  heroTimer = setInterval(() => goTo(current + 1), 6500);
  function resetTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => goTo(current + 1), 6500);
  }
}

/* ------------------------------------------------------------
   Búsqueda flexible (compartida por catalogo.js y cualquier otra
   página que necesite filtrar ANIME_LIST por texto).
   - Ignora mayúsculas/minúsculas y acentos ("accion" encuentra "Acción").
   - Busca en título, géneros y estudio, no solo en el título.
   - Si escribes varias palabras, no importa el orden ("drift sakura"
     encuentra "Sakura Drift"); solo deben aparecer todas en algún lado.
   ------------------------------------------------------------ */
function normalizeSearchText(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function animeSearchHaystack(anime) {
  return normalizeSearchText(
    [anime.title, ...(anime.genres || []), anime.studio].filter(Boolean).join(" ")
  );
}

function matchesSearchQuery(anime, rawQuery) {
  const query = normalizeSearchText(rawQuery).trim();
  if (!query) return true;

  const haystack = animeSearchHaystack(anime);
  const words = query.split(/\s+/).filter(Boolean);
  return words.every(word => haystack.includes(word));
}

/* ------------------------------------------------------------
   Utilidades compartidas
   ------------------------------------------------------------ */
function starString(rating) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function cardTemplate(a, opts = {}) {
  const badge = opts.badge || "";
  return `
    <a class="card" href="anime.html?id=${a.id}">
      <div class="card-poster">
        <img src="${a.cover}" alt="Portada de ${a.title}" loading="lazy">
        ${badge ? `<span class="badge">${badge}</span>` : ""}
        <span class="badge badge-rating">★ ${a.rating.toFixed(1)}</span>
        <div class="card-play"><span class="play-circle">${playIconSvg()}</span></div>
      </div>
      <div class="card-body">
        <h3>${a.title}</h3>
        <div class="card-genres">${a.genres.join(" · ")}</div>
      </div>
    </a>
  `;
}

function playIconSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l10-5.5-10-5.5z"/></svg>`;
}
