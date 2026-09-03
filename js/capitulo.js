/* ============================================================
   FicticionalTV — Página de capítulo (reproductor + navegación)
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ANIME_LIST llega de forma asíncrona desde Firestore, y puede volver
  // a cambiar mientras esta página sigue abierta (capítulo editado o
  // agregado desde el panel). Nos suscribimos a ambos eventos para que
  // el reproductor y el riel de episodios siempre reflejen lo último
  // guardado sin necesidad de recargar la página a mano.
  onLibraryReady(() => renderChapter());
  onLibraryChange(() => renderChapter());
});

function getChapterParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get("id"),
    ep: Number(params.get("ep")) || 1
  };
}

function renderChapter() {
  const { id, ep } = getChapterParams();
  const anime = getAnimeById(id) || ANIME_LIST[0];
  const episodes = [...anime.episodes].sort((a, b) => a.number - b.number);
  const episode = episodes.find(e => e.number === ep) || episodes[0];

  document.querySelector("#chapter-anime-link").textContent = anime.title;
  document.querySelector("#chapter-anime-link").href = `anime.html?id=${anime.id}`;
  document.querySelector("#chapter-back-link").href = `anime.html?id=${anime.id}`;

  if (!episode) {
    document.title = `${anime.title} — FicticionalTV`;
    document.querySelector("#chapter-title").textContent = anime.title;
    document.querySelector("#chapter-body").innerHTML = `
      <div class="empty-state">
        Este anime todavía no tiene capítulos cargados.<br>
        <a class="btn btn-primary" style="margin-top:16px;" href="admin.html?id=${anime.id}">Agregar capítulos en el panel</a>
      </div>
    `;
    return;
  }

  document.title = `${anime.title} · Episodio ${episode.number} — FicticionalTV`;
  document.querySelector("#chapter-title").textContent = `Episodio ${episode.number}: ${episode.title}`;

  renderPlayer(anime, episode);
  renderNavBar(anime, episodes, episode);
  renderEpisodesRail(anime, episodes, episode);
}

function renderPlayer(anime, episode) {
  const wrap = document.querySelector("#player-wrap");
  if (episode.embedUrl) {
    wrap.innerHTML = `
      <iframe
        src="${episode.embedUrl}"
        title="Reproductor de ${anime.title} — Episodio ${episode.number}"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowfullscreen
        referrerpolicy="no-referrer"
        loading="lazy"></iframe>
    `;
  } else {
    wrap.innerHTML = `
      <div class="no-embed-msg">
        <p>Este episodio todavía no tiene un reproductor configurado.</p>
        <a class="btn btn-ghost btn-sm" href="admin.html?id=${anime.id}">Agregar embed en el panel de administración</a>
      </div>
    `;
  }
}

function renderNavBar(anime, episodes, episode) {
  const idx = episodes.findIndex(e => e.number === episode.number);
  const prev = episodes[idx - 1];
  const next = episodes[idx + 1];

  const prevBtn = document.querySelector("#nav-prev");
  const nextBtn = document.querySelector("#nav-next");

  if (prev) {
    prevBtn.href = `capitulo.html?id=${anime.id}&ep=${prev.number}`;
    prevBtn.classList.remove("is-disabled");
    prevBtn.removeAttribute("aria-disabled");
  } else {
    prevBtn.removeAttribute("href");
    prevBtn.classList.add("is-disabled");
    prevBtn.setAttribute("aria-disabled", "true");
  }

  if (next) {
    nextBtn.href = `capitulo.html?id=${anime.id}&ep=${next.number}`;
    nextBtn.classList.remove("is-disabled");
    nextBtn.removeAttribute("aria-disabled");
  } else {
    nextBtn.removeAttribute("href");
    nextBtn.classList.add("is-disabled");
    nextBtn.setAttribute("aria-disabled", "true");
  }

  document.querySelector("#chapter-position").textContent =
    `Episodio ${episode.number} de ${episodes.length}`;

  const jump = document.querySelector("#chapter-jump");
  jump.innerHTML = episodes.map(e => `
    <option value="${e.number}" ${e.number === episode.number ? "selected" : ""}>
      Episodio ${e.number} — ${e.title}
    </option>
  `).join("");
  jump.onchange = () => {
    window.location.href = `capitulo.html?id=${anime.id}&ep=${jump.value}`;
  };
}

function renderEpisodesRail(anime, episodes, episode) {
  const rail = document.querySelector("#chapter-episodes-rail");
  rail.innerHTML = episodes.map(e => `
    <a class="episode-card ${e.number === episode.number ? "is-active" : ""}" href="capitulo.html?id=${anime.id}&ep=${e.number}">
      <div class="episode-thumb">
        <img src="${e.thumb}" alt="Miniatura del episodio ${e.number}" loading="lazy">
        <span class="ep-num">EP ${e.number}</span>
        <span class="play-circle">${playIconSvg()}</span>
      </div>
      <div class="episode-body">
        <h3>${e.title}</h3>
        <span>${e.embedUrl ? e.duration : "Sin video"}</span>
      </div>
    </a>
  `).join("");
}
