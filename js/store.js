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

/* Lista global usada por el resto de los scripts (main.js, catalogo.js,
   categorias.js, anime.js, capitulo.js, admin.js) tal como antes lo hacía
   data.js. Arranca con el catálogo semilla como respaldo inmediato
   mientras llega la primera respuesta real de Firestore. */
let ANIME_LIST = cloneSeedLibrary();
let libraryReady = false;

function libraryDocRef() {
  return db.collection(LIB_COLLECTION).doc(LIB_DOC_ID);
}

/* Se conecta a Firestore y se suscribe en tiempo real al documento de
   la biblioteca. La primera vez que llega una respuesta se dispara el
   evento "ficticionaltv:library-ready"; cualquier cambio posterior
   (hecho desde este dispositivo o desde cualquier otro) dispara
   "ficticionaltv:library-updated". */
function startLibrarySync() {
  const ref = libraryDocRef();

  // Si el documento todavía no existe en Firestore (primera vez que
  // se usa el proyecto), lo creamos con el catálogo semilla.
  ref.get().then(snap => {
    if (!snap.exists) {
      return ref.set({
        items: cloneSeedLibrary(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }).catch(err => {
    console.error("FicticionalTV: no se pudo inicializar la biblioteca en Firebase.", err);
  });

  ref.onSnapshot(docSnap => {
    if (docSnap.exists) {
      const data = docSnap.data();
      ANIME_LIST = Array.isArray(data.items) ? data.items : [];
    }
    const firstLoad = !libraryReady;
    libraryReady = true;
    window.dispatchEvent(new CustomEvent(firstLoad ? "ficticionaltv:library-ready" : "ficticionaltv:library-updated"));
  }, err => {
    console.error("FicticionalTV: se perdió la conexión en tiempo real con Firebase; se usará el catálogo semilla como respaldo local.", err);
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
    items: ANIME_LIST,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err => {
    console.warn("FicticionalTV: no se pudo guardar la biblioteca en Firebase.", err);
  });
}

function getAnimeById(id) {
  return ANIME_LIST.find(a => a.id === id);
}

function animeExistsByAnilistId(anilistId) {
  return anilistId != null && ANIME_LIST.some(a => a.anilistId === anilistId);
}

function nextPopularityRank() {
  return ANIME_LIST.length
    ? Math.max(...ANIME_LIST.map(a => a.popularityRank || 0)) + 1
    : 1;
}

/* Agrega un anime (normalmente proveniente de mapAniListItem()) a la
   biblioteca. Genera un id único basado en el título. */
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
    trailerEmbedUrl: anime.trailerEmbedUrl || null,
    episodes: [],
    source: "anilist",
    anilistId: anime.anilistId != null ? anime.anilistId : null
  };

  ANIME_LIST.push(record);
  persist();
  return record;
}

function removeAnimeFromLibrary(id) {
  ANIME_LIST = ANIME_LIST.filter(a => a.id !== id);
  persist();
}

/* Borra todo lo guardado en Firestore y vuelve a partir del catálogo
   semilla de data.js. Como ahora el almacenamiento es compartido, esto
   afecta a todo el mundo, no solo a este navegador. */
function resetLibraryToSeed() {
  const seeded = cloneSeedLibrary();
  ANIME_LIST = seeded;
  persist();
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
