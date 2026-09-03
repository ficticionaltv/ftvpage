/* ============================================================
   FicticionalTV — Almacén de datos (localStorage)
   Combina el catálogo semilla (js/data.js) con los animes y
   capítulos agregados desde el panel de administración
   (js/admin.js + js/jikan.js). Toda la app lee/escribe a través
   de las funciones de este archivo, así que debe cargarse
   siempre después de data.js y antes de main.js.
   ============================================================ */

const LIB_KEY = "ficticionaltv_library_v1";

function slugify(str) {
  return (
    String(str)
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "anime"
  );
}

function cloneSeedLibrary() {
  return SEED_ANIME_LIST.map(a => ({
    ...a,
    genres: [...a.genres],
    episodes: a.episodes.map(ep => ({ ...ep }))
  }));
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn("FicticionalTV: no se pudo leer la biblioteca guardada.", err);
  }
  const seeded = cloneSeedLibrary();
  saveLibrary(seeded);
  return seeded;
}

function saveLibrary(list) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("FicticionalTV: no se pudo guardar la biblioteca.", err);
  }
}

/* Lista global usada por el resto de los scripts (main.js, catalogo.js,
   categorias.js, anime.js, capitulo.js, admin.js) tal como antes lo hacía
   data.js, pero ahora persistida en localStorage. */
let ANIME_LIST = loadLibrary();

function refreshAnimeList() {
  ANIME_LIST = loadLibrary();
  return ANIME_LIST;
}

function persist() {
  saveLibrary(ANIME_LIST);
}

function getAnimeById(id) {
  return ANIME_LIST.find(a => a.id === id);
}

function animeExistsByMalId(malId) {
  return malId != null && ANIME_LIST.some(a => a.malId === malId);
}

function nextPopularityRank() {
  return ANIME_LIST.length
    ? Math.max(...ANIME_LIST.map(a => a.popularityRank || 0)) + 1
    : 1;
}

/* Agrega un anime (normalmente proveniente de mapJikanItem()) a la
   biblioteca local. Genera un id único basado en el título. */
function addAnimeToLibrary(anime) {
  const base = slugify(anime.title);
  let id = base;
  let n = 2;
  while (ANIME_LIST.some(a => a.id === id)) id = `${base}-${n++}`;

  const record = {
    id,
    title: anime.title,
    synopsis: anime.synopsis && anime.synopsis.trim() ? anime.synopsis.trim() : "Sinopsis no disponible todavía.",
    genres: anime.genres && anime.genres.length ? anime.genres : ["Sin categoría"],
    rating: anime.rating || 0,
    year: anime.year || new Date().getFullYear(),
    studio: anime.studio || "Estudio desconocido",
    popularityRank: nextPopularityRank(),
    recent: true,
    cover: anime.cover || coverUrl(id),
    banner: anime.banner || anime.cover || bannerUrl(id),
    episodes: [],
    source: "jikan",
    malId: anime.malId != null ? anime.malId : null
  };

  ANIME_LIST.push(record);
  persist();
  return record;
}

function removeAnimeFromLibrary(id) {
  ANIME_LIST = ANIME_LIST.filter(a => a.id !== id);
  persist();
}

/* Borra todo lo guardado en este navegador y vuelve a partir del
   catálogo semilla de data.js. Útil en desarrollo cuando editas
   data.js y el navegador sigue mostrando una copia vieja guardada
   en localStorage (cada navegador/perfil tiene la suya). */
function resetLibraryToSeed() {
  const seeded = cloneSeedLibrary();
  ANIME_LIST = seeded;
  saveLibrary(seeded);
  return seeded;
}

/* Agrega o reemplaza (por número) un capítulo de un anime. */
function addEpisodeToAnime(animeId, episode) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;

  const number = episode.number || (
    anime.episodes.length ? Math.max(...anime.episodes.map(e => e.number)) + 1 : 1
  );

  const record = {
    number,
    title: episode.title && episode.title.trim() ? episode.title.trim() : `Episodio ${number}`,
    thumb: episode.thumb || epThumbUrl(anime.id, number),
    duration: episode.duration && episode.duration.trim() ? episode.duration.trim() : "23 min",
    embedUrl: episode.embedUrl || null
  };

  anime.episodes = anime.episodes.filter(e => e.number !== number);
  anime.episodes.push(record);
  anime.episodes.sort((a, b) => a.number - b.number);
  anime.episodesCount = anime.episodes.length;
  persist();
  return record;
}

function updateEpisode(animeId, number, patch) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  const ep = anime.episodes.find(e => e.number === number);
  if (!ep) return null;
  if (patch.title && patch.title.trim()) ep.title = patch.title.trim();
  if (patch.duration && patch.duration.trim()) ep.duration = patch.duration.trim();
  ep.embedUrl = patch.embedUrl || null;
  persist();
  return ep;
}

function removeEpisode(animeId, number) {
  const anime = getAnimeById(animeId);
  if (!anime) return;
  anime.episodes = anime.episodes.filter(e => e.number !== number);
  anime.episodesCount = anime.episodes.length;
  persist();
}
