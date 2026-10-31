/* ============================================================
   FicticionalTV — Almacén de datos (Firebase Firestore)
   Combina el catálogo semilla (js/data.js) con los animes y
   capítulos agregados desde el panel de administración
   (js/admin.js + js/anilist.js). Toda la app lee/escribe a través
   de las funciones de este archivo, así que debe cargarse
   siempre después de js/firebase-config.js y js/data.js, y antes
   de main.js.

   A diferencia de la versión anterior (que guardaba todo en
   localStorage, es decir, solo en el navegador de cada quien),
   ahora todo se guarda en un documento de Firestore. Así, un
   cambio hecho desde el panel de administración en un dispositivo
   se ve igual para todo el mundo, en cualquier navegador, casi en
   tiempo real (gracias a onSnapshot).
   ============================================================ */

const LIB_COLLECTION = "ficticionaltv";
const LIB_DOC_ID = "library";

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

/* Prepara la lista de animes para guardarla en Firestore. Se guardan las
   temporadas (`seasons`) como fuente de verdad; además se mantienen
   `episodes` y `trailerEmbedUrl` como copia de la primera temporada, para
   que cualquier página antigua (o editada a mano en la consola) siga
   funcionando. */
function serializeLibrary(list) {
  return list.map(a => {
    const normalized = Array.isArray(a.seasons) ? a : normalizeAnimeRecord(a);
    const { episodesCount, ...rest } = normalized;
    return {
      ...rest,
      seasons: normalized.seasons.map(s => ({
        number: s.number,
        title: s.title || "",
        trailerEmbedUrl: s.trailerEmbedUrl || null,
        episodes: s.episodes
      })),
      episodes: normalized.seasons[0].episodes,
      trailerEmbedUrl: normalized.seasons[0].trailerEmbedUrl || null
    };
  });
}

function cloneSeedExtras() {
  return SEED_EXTRAS_LIST.map(x => ({
    ...x,
    genres: [...(x.genres || [])],
    audio: (x.audio || []).map(item => ({ ...item })),
    video: (x.video || []).map(item => ({ ...item }))
  }));
}

/* Normaliza un registro de anime tal como venga de Firestore (semilla,
   agregado por AniList, o incluso editado a mano en la consola de
   Firebase). Si a un documento le falta algún campo — sobre todo
   `episodes`, que no es un arreglo válido — el resto del sitio revienta
   en silencio (anime.episodes.length lanza un TypeError y corta la
   ejecución antes de pintar el tráiler o los capítulos). Por eso todo
   lo que llega de Firestore pasa por aquí antes de usarse. */
function normalizeAnimeRecord(a) {
  a = a || {};
  const id = a.id || slugify(a.title || "anime");
  const seasons = normalizeSeasonsOf(id, a);
  const first = seasons[0];

  return {
    ...a,
    id,
    title: a.title || "Sin título",
    synopsis: a.synopsis || "Sinopsis no disponible todavía.",
    genres: Array.isArray(a.genres) && a.genres.length ? a.genres : ["Sin categoría"],
    rating: normalizeRating(a.rating),
    year: a.year || new Date().getFullYear(),
    studio: a.studio || "Estudio desconocido",
    popularityRank: typeof a.popularityRank === "number" ? a.popularityRank : 0,
    recent: !!a.recent,
    cover: a.cover || coverUrl(id),
    banner: a.banner || a.cover || bannerUrl(id),
    audio: a.audio || null,
    cast: a.cast || null,
    logo: a.logo || null,
    source: a.source || "seed",
    anilistId: a.anilistId != null ? a.anilistId : null,
    seasons,
    // Campos derivados, por compatibilidad con el resto del sitio (y la
    // versión TV): `episodes` y `trailerEmbedUrl` apuntan a la PRIMERA
    // temporada, y `episodesCount` es el total de todas las temporadas.
    episodes: first.episodes,
    trailerEmbedUrl: first.trailerEmbedUrl,
    episodesCount: seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  };
}

/* ------------------------------------------------------------
   Temporadas
   Cada anime tiene un arreglo `seasons`: [{ number, title, trailerEmbedUrl,
   episodes: [...] }]. Los animes antiguos (guardados antes de que existieran
   las temporadas) solo traen `episodes` y `trailerEmbedUrl` sueltos: se
   convierten automáticamente en la "Temporada 1". Siempre hay al menos una
   temporada.
   ------------------------------------------------------------ */
function normalizeSeasonsOf(animeId, a) {
  let raw = Array.isArray(a.seasons) ? a.seasons.filter(Boolean) : [];
  if (!raw.length) {
    raw = [{ number: 1, title: "", trailerEmbedUrl: a.trailerEmbedUrl, episodes: a.episodes }];
  }
  const seen = new Set();
  const seasons = [];
  raw.forEach((s, i) => {
    const season = normalizeSeasonRecord(animeId, s, i + 1);
    if (seen.has(season.number)) return; // número repetido: nos quedamos con la primera
    seen.add(season.number);
    seasons.push(season);
  });
  seasons.sort((x, y) => x.number - y.number);
  return seasons;
}

function normalizeSeasonRecord(animeId, s, fallbackNumber) {
  s = s || {};
  const number = Number.isInteger(s.number) && s.number >= 1 ? s.number : fallbackNumber;
  return {
    number,
    title: s.title && String(s.title).trim() ? String(s.title).trim() : "",
    trailerEmbedUrl: s.trailerEmbedUrl ? normalizeEmbedUrl(s.trailerEmbedUrl) : null,
    episodes: Array.isArray(s.episodes)
      ? s.episodes.map(ep => normalizeEpisodeRecord(animeId, ep))
      : []
  };
}

/* Devuelve la temporada pedida; si no existe (o no se indica), la primera. */
function getSeason(anime, number) {
  if (!anime || !Array.isArray(anime.seasons) || !anime.seasons.length) return null;
  const n = Number(number);
  return anime.seasons.find(s => s.number === n) || anime.seasons[0];
}

/* Texto para mostrar: "Temporada 2" o "Temporada 2 · Nombre". */
function seasonLabel(season, { withTitle = true } = {}) {
  if (!season) return "";
  const base = `Temporada ${season.number}`;
  return withTitle && season.title ? `${base} · ${season.title}` : base;
}

/* Recalcula los campos derivados (episodes / trailerEmbedUrl / episodesCount)
   después de cualquier cambio en las temporadas. */
function syncAnimeDerived(anime) {
  anime.seasons.sort((x, y) => x.number - y.number);
  const first = anime.seasons[0];
  anime.episodes = first.episodes;
  anime.trailerEmbedUrl = first.trailerEmbedUrl;
  anime.episodesCount = anime.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
}

/* Acota cualquier rating a un número finito entre 0 y 10 (AniList
   devuelve averageScore de 0 a 100, y anilist.js ya lo convierte a una
   escala de 0 a 10 dividiendo entre 10 — por ejemplo 6.5). Antes esto se
   acotaba a un máximo de 5, así que cualquier anime con 5.1 o más se
   mostraba recortado a 5.0. Un rating corrupto (negativo, texto, etc.
   venga de donde venga) rompía starString() con un RangeError y tumbaba
   toda la página, así que lo seguimos acotando, solo que con el tope
   correcto. */
function normalizeRating(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, n));
}

/* Segundos (número o texto "1:30" / "90"); devuelve null si no es válido.
   Se usa para marcar dónde empieza y termina la intro de un capítulo. */
function normalizeSeconds(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const parts = String(value).trim().split(":").map(p => Number(p));
  if (!parts.length || parts.length > 3 || parts.some(n => !Number.isFinite(n) || n < 0)) return null;
  return Math.round(parts.reduce((acc, n) => acc * 60 + n, 0));
}

function normalizeEpisodeRecord(animeId, ep) {
  ep = ep || {};
  const number = typeof ep.number === "number" && !Number.isNaN(ep.number) ? ep.number : 1;
  return {
    ...ep,
    number,
    title: ep.title && String(ep.title).trim() ? ep.title : `Episodio ${number}`,
    thumb: ep.thumb || epThumbUrl(animeId, number),
    duration: ep.duration && String(ep.duration).trim() ? ep.duration : "23 min",
    embedUrl: ep.embedUrl ? normalizeEmbedUrl(ep.embedUrl) : null,
    introStart: normalizeSeconds(ep.introStart),
    introEnd: normalizeSeconds(ep.introEnd)
  };
}

/* ------------------------------------------------------------
   Extras (contenido aparte del catálogo de animes, agrupado en
   "Audio" y "Video" — ambas listas guardan videos, solo se muestran
   en dos cuadrículas separadas dentro de la ficha del extra).
   ------------------------------------------------------------ */
function normalizeExtraRecord(x) {
  x = x || {};
  const id = x.id || slugify(x.title || "extra");
  const audio = Array.isArray(x.audio) ? x.audio.map(item => normalizeExtraItemRecord(id, "audio", item)) : [];
  const video = Array.isArray(x.video) ? x.video.map(item => normalizeExtraItemRecord(id, "video", item)) : [];

  return {
    ...x,
    id,
    title: x.title || "Sin título",
    synopsis: x.synopsis || "Sinopsis no disponible todavía.",
    genres: Array.isArray(x.genres) && x.genres.length ? x.genres : ["Sin categoría"],
    rating: normalizeRating(x.rating),
    year: x.year || new Date().getFullYear(),
    studio: x.studio || "Estudio desconocido",
    popularityRank: typeof x.popularityRank === "number" ? x.popularityRank : 0,
    cover: x.cover || coverUrl(id),
    banner: x.banner || x.cover || bannerUrl(id),
    logo: x.logo || null,
    // Anime al que pertenece este extra (id de ANIME_LIST) o null si es independiente.
    animeId: typeof x.animeId === "string" && x.animeId.trim() ? x.animeId.trim() : null,
    audio,
    video,
    source: "extra"
  };
}

function normalizeExtraItemRecord(extraId, kind, item) {
  item = item || {};
  const number = typeof item.number === "number" && !Number.isNaN(item.number) ? item.number : 1;
  return {
    ...item,
    number,
    title: item.title && String(item.title).trim() ? item.title : `${kind === "audio" ? "Audio" : "Video"} ${number}`,
    thumb: item.thumb || epThumbUrl(`${extraId}-${kind}`, number),
    duration: item.duration && String(item.duration).trim() ? item.duration : "23 min",
    embedUrl: item.embedUrl ? normalizeEmbedUrl(item.embedUrl) : null
  };
}

/* Lista global usada por el resto de los scripts (main.js, catalogo.js,
   categorias.js, anime.js, capitulo.js, admin.js) tal como antes lo hacía
   data.js. Arranca con el catálogo semilla como respaldo inmediato
   mientras llega la primera respuesta real de Firestore. */
let ANIME_LIST = cloneSeedLibrary().map(normalizeAnimeRecord);
let EXTRAS_LIST = cloneSeedExtras();
/* Imágenes de las tarjetas de Categorías: { "Acción": "https://…", … }.
   Se editan desde Admin → Categorías y viajan en el mismo documento de
   Firestore que los animes y los extras. */
let GENRE_IMAGES = {};
let libraryReady = false;

/* "connecting" mientras esperamos la primera respuesta, "online" en
   cuanto Firestore contesta con datos reales, "offline" si nunca
   contestó y tuvimos que arrancar con el catálogo semilla local (sin
   guardar cambios de verdad hasta reconectar). Útil para mostrar un
   indicador de estado en el panel de administración. */
let libraryConnectionStatus = "connecting";

function libraryDocRef() {
  return db.collection(LIB_COLLECTION).doc(LIB_DOC_ID);
}

function getLibraryConnectionStatus() {
  return libraryConnectionStatus;
}

/* Avisa cuando cambia el estado de conexión con Firebase (para pintar
   un pill de estado tipo "conectado / sin conexión" en el panel). */
function onLibraryConnectionChange(callback) {
  window.addEventListener("ficticionaltv:library-connection", () => callback(libraryConnectionStatus));
}

function setConnectionStatus(status) {
  if (libraryConnectionStatus === status) return;
  libraryConnectionStatus = status;
  window.dispatchEvent(new CustomEvent("ficticionaltv:library-connection"));
}

/* Se conecta a Firestore y se suscribe en tiempo real al documento de
   la biblioteca. La primera vez que llega una respuesta se dispara el
   evento "ficticionaltv:library-ready"; cualquier cambio posterior
   (hecho desde este dispositivo o desde cualquier otro) dispara
   "ficticionaltv:library-updated".

   IMPORTANTE: si Firestore nunca responde (por ejemplo, porque la base
   de datos todavía no existe en la consola de Firebase, las reglas la
   están bloqueando, o no hay red), un onSnapshot() colgado se queda
   esperando en silencio, SIN llamar ni al callback de éxito ni al de
   error. Para que el resto de la app (panel de admin incluido) nunca
   se quede congelada esperando para siempre, forzamos "library-ready"
   con el catálogo semilla local después de unos segundos si Firestore
   no dio señales de vida. */
function startLibrarySync() {
  const ref = libraryDocRef();

  const READY_TIMEOUT_MS = 7000;
  const readyFallbackTimer = setTimeout(() => {
    if (!libraryReady) {
      console.warn("FicticionalTV: Firebase no respondió a tiempo (¿ya creaste la base de datos Firestore y configuraste sus reglas en la consola?). Se usará el catálogo semilla como respaldo temporal; los cambios no se guardarán hasta reconectar.");
      libraryReady = true;
      setConnectionStatus("offline");
      window.dispatchEvent(new CustomEvent("ficticionaltv:library-ready"));
    }
  }, READY_TIMEOUT_MS);

  // Si el documento todavía no existe en Firestore (primera vez que
  // se usa el proyecto), lo creamos con el catálogo semilla.
  ref.get().then(snap => {
    if (!snap.exists) {
      return ref.set({
        items: serializeLibrary(cloneSeedLibrary()),
        extras: cloneSeedExtras(),
        genreImages: {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }).catch(err => {
    console.error("FicticionalTV: no se pudo inicializar la biblioteca en Firebase.", err);
  });

  ref.onSnapshot(docSnap => {
    clearTimeout(readyFallbackTimer);
    if (docSnap.exists) {
      const data = docSnap.data();
      ANIME_LIST = Array.isArray(data.items) ? data.items.map(normalizeAnimeRecord) : [];
      EXTRAS_LIST = Array.isArray(data.extras) ? data.extras.map(normalizeExtraRecord) : [];
      GENRE_IMAGES = normalizeGenreImages(data.genreImages);
    }
    const firstLoad = !libraryReady;
    libraryReady = true;
    setConnectionStatus("online");
    window.dispatchEvent(new CustomEvent(firstLoad ? "ficticionaltv:library-ready" : "ficticionaltv:library-updated"));
  }, err => {
    clearTimeout(readyFallbackTimer);
    console.error("FicticionalTV: se perdió la conexión en tiempo real con Firebase; se usará el catálogo semilla como respaldo local.", err);
    setConnectionStatus("offline");
    if (!libraryReady) {
      libraryReady = true;
      window.dispatchEvent(new CustomEvent("ficticionaltv:library-ready"));
    }
  });
}

startLibrarySync();

/* Ejecuta callback(ANIME_LIST) en cuanto la biblioteca esté lista (si ya
   lo está, se ejecuta de inmediato; si no, en cuanto llegue la primera
   respuesta de Firestore). Úsalo para el primer render de cada página,
   ya que la carga desde Firestore es asíncrona. */
function onLibraryReady(callback) {
  if (libraryReady) { callback(ANIME_LIST); return; }
  window.addEventListener("ficticionaltv:library-ready", () => callback(ANIME_LIST), { once: true });
}

/* Ejecuta callback(ANIME_LIST) cada vez que la biblioteca cambia después
   de la carga inicial (por ejemplo, porque alguien agregó un anime desde
   el panel en otro dispositivo). Úsalo en páginas donde tiene sentido
   refrescar la vista sola. */
function onLibraryChange(callback) {
  window.addEventListener("ficticionaltv:library-updated", () => callback(ANIME_LIST));
}

function persist() {
  libraryDocRef().set({
    items: serializeLibrary(ANIME_LIST),
    extras: EXTRAS_LIST,
    genreImages: GENRE_IMAGES,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err => {
    console.warn("FicticionalTV: no se pudo guardar la biblioteca en Firebase.", err);
  });
}

function getAnimeById(id) {
  return ANIME_LIST.find(a => a.id === id);
}

/* ------------------------------------------------------------
   Imágenes de categorías
   ------------------------------------------------------------ */
function normalizeGenreImages(raw) {
  const out = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    Object.keys(raw).forEach(k => {
      const v = raw[k];
      if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) out[k] = v.trim();
    });
  }
  return out;
}

function getGenreImage(genre) {
  return GENRE_IMAGES[genre] || null;
}

/* Guarda (o quita, si la URL viene vacía) la imagen de una categoría. */
function setGenreImage(genre, url) {
  const clean = typeof url === "string" ? url.trim() : "";
  if (clean) {
    if (!/^https?:\/\//i.test(clean)) return false;
    GENRE_IMAGES[genre] = clean;
  } else {
    delete GENRE_IMAGES[genre];
  }
  persist();
  return true;
}

/* Valor seguro para usar dentro de url('…') en un atributo style. */
function cssUrl(url) {
  const esc = ch => "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
  return "url('" + String(url).replace(/['"()<>\\\s]/g, esc) + "')";
}

/* ¿El anime tiene al menos un episodio en alguna de sus temporadas? */
function animeHasEpisodes(anime) {
  if (!anime) return false;
  if (Array.isArray(anime.seasons) && anime.seasons.length) {
    return anime.seasons.some(s => Array.isArray(s.episodes) && s.episodes.length > 0);
  }
  return Array.isArray(anime.episodes) && anime.episodes.length > 0;
}

/* Animes que se muestran al público en el sitio: solo los que ya tienen
   episodios. Los que no tienen ninguno solo aparecen en "Próximamente"
   (inicio) y en el panel de administración, que sigue usando ANIME_LIST
   completa. */
function getVisibleAnimes() {
  return ANIME_LIST.filter(animeHasEpisodes);
}

/* Animes sin ningún episodio: los de la sección "Próximamente". */
function getUpcomingAnimes() {
  return ANIME_LIST.filter(a => !animeHasEpisodes(a));
}

function animeExistsByAnilistId(anilistId) {
  return anilistId != null && ANIME_LIST.some(a => a.anilistId === anilistId);
}

function nextPopularityRank() {
  return ANIME_LIST.length
    ? Math.max(...ANIME_LIST.map(a => a.popularityRank || 0)) + 1
    : 1;
}

/* Agrega un anime a la biblioteca. Puede venir de AniList
   (mapAniListItem()) o haberse creado a mano desde el panel (sin
   anilistId; se guarda con source "manual"). Genera un id único basado
   en el título. */
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
    rating: normalizeRating(anime.rating),
    year: anime.year || new Date().getFullYear(),
    studio: anime.studio || "Estudio desconocido",
    popularityRank: nextPopularityRank(),
    recent: true,
    cover: anime.cover || coverUrl(id),
    banner: anime.banner || anime.cover || bannerUrl(id),
    audio: anime.audio || null,
    cast: anime.cast || null,
    logo: anime.logo || null,
    seasons: [{
      number: 1,
      title: "",
      trailerEmbedUrl: anime.trailerEmbedUrl ? normalizeEmbedUrl(anime.trailerEmbedUrl) : null,
      episodes: []
    }],
    source: anime.anilistId != null ? "anilist" : "manual",
    anilistId: anime.anilistId != null ? anime.anilistId : null
  };
  syncAnimeDerived(record);

  ANIME_LIST.push(record);
  persist();
  return record;
}

function removeAnimeFromLibrary(id) {
  ANIME_LIST = ANIME_LIST.filter(a => a.id !== id);
  persist();
}

/* Actualiza el tráiler de UNA temporada de un anime (URL de embed, para el
   <iframe> de la ficha). Si no se indica temporada, se usa la primera. */
function updateAnimeTrailer(animeId, trailerEmbedUrl, seasonNumber) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  const season = getSeason(anime, seasonNumber);
  season.trailerEmbedUrl = trailerEmbedUrl && trailerEmbedUrl.trim() ? normalizeEmbedUrl(trailerEmbedUrl.trim()) : null;
  syncAnimeDerived(anime);
  persist();
  return anime;
}

/* ------------------------------------------------------------
   Temporadas — CRUD
   ------------------------------------------------------------ */
function nextSeasonNumber(anime) {
  return anime.seasons.length ? Math.max(...anime.seasons.map(s => s.number)) + 1 : 1;
}

/* Agrega una temporada nueva (vacía). Si el número ya existe, no hace nada
   y devuelve null. */
function addSeasonToAnime(animeId, { number, title, trailerEmbedUrl } = {}) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  const n = Number.isInteger(number) && number >= 1 ? number : nextSeasonNumber(anime);
  if (anime.seasons.some(s => s.number === n)) return null;

  const season = {
    number: n,
    title: title && title.trim() ? title.trim() : "",
    trailerEmbedUrl: trailerEmbedUrl && trailerEmbedUrl.trim() ? normalizeEmbedUrl(trailerEmbedUrl.trim()) : null,
    episodes: []
  };
  anime.seasons.push(season);
  syncAnimeDerived(anime);
  persist();
  return season;
}

function updateSeason(animeId, seasonNumber, patch = {}) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  const season = anime.seasons.find(s => s.number === seasonNumber);
  if (!season) return null;
  if (typeof patch.title === "string") season.title = patch.title.trim();
  syncAnimeDerived(anime);
  persist();
  return season;
}

/* Elimina una temporada con todos sus capítulos. Siempre debe quedar al
   menos una, así que la última no se puede borrar. */
function removeSeason(animeId, seasonNumber) {
  const anime = getAnimeById(animeId);
  if (!anime || anime.seasons.length <= 1) return false;
  anime.seasons = anime.seasons.filter(s => s.number !== seasonNumber);
  syncAnimeDerived(anime);
  persist();
  return true;
}

/* Actualiza la sección editable de información (audio y reparto) que se
   muestra en la ficha, debajo de la sinopsis. Género y estudio se toman
   directamente de los campos que ya existen (genres/studio). */
function updateAnimeInfo(animeId, { audio, cast } = {}) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  anime.audio = audio && audio.trim() ? audio.trim() : null;
  anime.cast = cast && cast.trim() ? cast.trim() : null;
  persist();
  return anime;
}

/* Actualiza la imagen de fondo/banner del anime (la que se ve en el
   slider de inicio y arriba de su ficha). Se usa desde el panel para
   reemplazar la que trajo AniList si no convence. Un campo vacío
   vuelve a la imagen de relleno automática, nunca la deja en blanco. */
function updateAnimeBanner(animeId, newBannerUrl) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  anime.banner = newBannerUrl && newBannerUrl.trim() ? newBannerUrl.trim() : (anime.cover || bannerUrl(animeId));
  persist();
  return anime;
}

/* Actualiza el logo/isotipo del anime (imagen que reemplaza al título de
   texto en el slider y en la ficha). Se guarda como una URL de imagen
   (subida a Firebase Storage desde el panel, o pegada a mano). */
function updateAnimeLogo(animeId, logoUrl) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  anime.logo = logoUrl && logoUrl.trim() ? logoUrl.trim() : null;
  persist();
  return anime;
}

/* Borra todo lo guardado en Firestore y vuelve a partir del catálogo
   semilla de data.js. Como ahora el almacenamiento es compartido, esto
   afecta a todo el mundo, no solo a este navegador. */
function resetLibraryToSeed() {
  const seeded = cloneSeedLibrary().map(normalizeAnimeRecord);
  ANIME_LIST = seeded;
  EXTRAS_LIST = cloneSeedExtras();
  persist();
  return seeded;
}

/* Agrega o reemplaza (por número) un capítulo en una temporada de un anime.
   Si no se indica temporada, se usa la primera. */
function addEpisodeToAnime(animeId, episode, seasonNumber) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  const season = getSeason(anime, seasonNumber);

  const number = episode.number || (
    season.episodes.length ? Math.max(...season.episodes.map(e => e.number)) + 1 : 1
  );

  const record = {
    number,
    title: episode.title && episode.title.trim() ? episode.title.trim() : `Episodio ${number}`,
    thumb: episode.thumb || epThumbUrl(seasonThumbSeed(anime, season), number),
    duration: episode.duration && episode.duration.trim() ? episode.duration.trim() : "23 min",
    embedUrl: episode.embedUrl ? normalizeEmbedUrl(episode.embedUrl) : null,
    introStart: normalizeSeconds(episode.introStart),
    introEnd: normalizeSeconds(episode.introEnd)
  };

  season.episodes = season.episodes.filter(e => e.number !== number);
  season.episodes.push(record);
  season.episodes.sort((a, b) => a.number - b.number);
  syncAnimeDerived(anime);
  persist();
  return record;
}

/* La temporada 1 conserva la semilla de miniaturas de siempre (el id del
   anime); las demás usan una propia para no repetir las mismas imágenes. */
function seasonThumbSeed(anime, season) {
  return season.number === anime.seasons[0].number ? anime.id : `${anime.id}-s${season.number}`;
}

function updateEpisode(animeId, number, patch, seasonNumber) {
  const anime = getAnimeById(animeId);
  if (!anime) return null;
  const season = getSeason(anime, seasonNumber);
  const ep = season.episodes.find(e => e.number === number);
  if (!ep) return null;
  if (patch.title && patch.title.trim()) ep.title = patch.title.trim();
  if (patch.duration && patch.duration.trim()) ep.duration = patch.duration.trim();
  ep.embedUrl = patch.embedUrl ? normalizeEmbedUrl(patch.embedUrl) : null;
  ep.introStart = normalizeSeconds(patch.introStart);
  ep.introEnd = normalizeSeconds(patch.introEnd);
  ep.thumb = (patch.thumb && patch.thumb.trim()) ? patch.thumb.trim() : epThumbUrl(seasonThumbSeed(anime, season), ep.number);
  syncAnimeDerived(anime);
  persist();
  return ep;
}

function removeEpisode(animeId, number, seasonNumber) {
  const anime = getAnimeById(animeId);
  if (!anime) return;
  const season = getSeason(anime, seasonNumber);
  season.episodes = season.episodes.filter(e => e.number !== number);
  syncAnimeDerived(anime);
  persist();
}

/* ============================================================
   Extras — CRUD
   ------------------------------------------------------------
   Espejo de las funciones de arriba para animes/capítulos, pero
   aplicado a EXTRAS_LIST. Cada extra tiene dos listas de video
   independientes, "audio" y "video" (el nombre es solo la etiqueta
   de la sección; ambas cosas son video), identificadas por `kind`.
   ============================================================ */
function getExtraById(id) {
  return EXTRAS_LIST.find(x => x.id === id);
}

/* Extras vinculados a un anime (los que se asignaron desde el panel de
   administración con el campo "Anime al que pertenece"). */
function getExtrasForAnime(animeId) {
  if (!animeId) return [];
  return EXTRAS_LIST.filter(x => x.animeId === animeId);
}

function nextExtraPopularityRank() {
  return EXTRAS_LIST.length
    ? Math.max(...EXTRAS_LIST.map(x => x.popularityRank || 0)) + 1
    : 1;
}

function extraItemList(extra, kind) {
  return kind === "video" ? extra.video : extra.audio;
}

/* Agrega un extra nuevo a la biblioteca (creado a mano desde el panel,
   no viene de AniList). */
function addExtraToLibrary(extra) {
  const base = slugify(extra.title);
  let id = base;
  let n = 2;
  while (EXTRAS_LIST.some(x => x.id === id)) id = `${base}-${n++}`;

  const record = {
    id,
    title: extra.title,
    synopsis: extra.synopsis && extra.synopsis.trim() ? extra.synopsis.trim() : "Sinopsis no disponible todavía.",
    genres: extra.genres && extra.genres.length ? extra.genres : ["Sin categoría"],
    rating: normalizeRating(extra.rating),
    year: extra.year || new Date().getFullYear(),
    studio: extra.studio || "Estudio desconocido",
    popularityRank: nextExtraPopularityRank(),
    cover: extra.cover || coverUrl(id),
    banner: extra.banner || extra.cover || bannerUrl(id),
    logo: extra.logo || null,
    animeId: typeof extra.animeId === "string" && extra.animeId.trim() ? extra.animeId.trim() : null,
    audio: [],
    video: [],
    source: "extra"
  };

  EXTRAS_LIST.push(record);
  persist();
  return record;
}

function removeExtraFromLibrary(id) {
  EXTRAS_LIST = EXTRAS_LIST.filter(x => x.id !== id);
  persist();
}

/* Actualiza los campos generales de la ficha del extra (sinopsis,
   género, estudio, etc). */
function updateExtraDetails(extraId, patch = {}) {
  const extra = getExtraById(extraId);
  if (!extra) return null;
  if (patch.title && patch.title.trim()) extra.title = patch.title.trim();
  if (typeof patch.synopsis === "string") extra.synopsis = patch.synopsis.trim() || "Sinopsis no disponible todavía.";
  if (Array.isArray(patch.genres)) extra.genres = patch.genres.length ? patch.genres : ["Sin categoría"];
  if (patch.studio && patch.studio.trim()) extra.studio = patch.studio.trim();
  if ("animeId" in patch) extra.animeId = patch.animeId && String(patch.animeId).trim() ? String(patch.animeId).trim() : null;
  persist();
  return extra;
}

function updateExtraBanner(extraId, newBannerUrl) {
  const extra = getExtraById(extraId);
  if (!extra) return null;
  extra.banner = newBannerUrl && newBannerUrl.trim() ? newBannerUrl.trim() : (extra.cover || bannerUrl(extraId));
  persist();
  return extra;
}

function updateExtraLogo(extraId, logoUrl) {
  const extra = getExtraById(extraId);
  if (!extra) return null;
  extra.logo = logoUrl && logoUrl.trim() ? logoUrl.trim() : null;
  persist();
  return extra;
}

/* Agrega o reemplaza (por número) un elemento de audio o video de un
   extra. */
function addExtraItem(extraId, kind, item) {
  const extra = getExtraById(extraId);
  if (!extra) return null;
  const list = extraItemList(extra, kind);

  const number = item.number || (
    list.length ? Math.max(...list.map(i => i.number)) + 1 : 1
  );

  const record = {
    number,
    title: item.title && item.title.trim() ? item.title.trim() : `${kind === "audio" ? "Audio" : "Video"} ${number}`,
    thumb: item.thumb || epThumbUrl(`${extra.id}-${kind}`, number),
    duration: item.duration && item.duration.trim() ? item.duration.trim() : "23 min",
    embedUrl: item.embedUrl ? normalizeEmbedUrl(item.embedUrl) : null
  };

  const filtered = list.filter(i => i.number !== number);
  filtered.push(record);
  filtered.sort((a, b) => a.number - b.number);
  if (kind === "video") extra.video = filtered; else extra.audio = filtered;
  persist();
  return record;
}

function updateExtraItem(extraId, kind, number, patch) {
  const extra = getExtraById(extraId);
  if (!extra) return null;
  const list = extraItemList(extra, kind);
  const item = list.find(i => i.number === number);
  if (!item) return null;
  if (patch.title && patch.title.trim()) item.title = patch.title.trim();
  if (patch.duration && patch.duration.trim()) item.duration = patch.duration.trim();
  item.embedUrl = patch.embedUrl ? normalizeEmbedUrl(patch.embedUrl) : null;
  item.thumb = (patch.thumb && patch.thumb.trim()) ? patch.thumb.trim() : epThumbUrl(`${extra.id}-${kind}`, item.number);
  persist();
  return item;
}

function removeExtraItem(extraId, kind, number) {
  const extra = getExtraById(extraId);
  if (!extra) return;
  const list = extraItemList(extra, kind).filter(i => i.number !== number);
  if (kind === "video") extra.video = list; else extra.audio = list;
  persist();
}
