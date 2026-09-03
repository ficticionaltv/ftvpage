/* ============================================================
   FicticionalTV — Integración con AniList API
   Documentación: https://docs.anilist.co/
   API GraphQL: https://graphql.anilist.co
   Solo se usa en el panel de administración (admin.html).
   ============================================================ */

const ANILIST_BASE = "https://graphql.anilist.co";

/* Traducción aproximada de géneros de AniList a las etiquetas en
   español que ya usa el sitio (ver GENRES en data.js). Los géneros
   sin traducción se dejan tal cual llegan de la API. */
const ANILIST_GENRE_ES = {
  "Action": "Acción",
  "Adventure": "Aventura",
  "Comedy": "Comedia",
  "Drama": "Drama",
  "Ecchi": "Ecchi",
  "Fantasy": "Fantasía",
  "Hentai": "Hentai",
  "Horror": "Terror",
  "Mahou Shoujo": "Mahou Shoujo",
  "Mecha": "Fantasía",
  "Music": "Música",
  "Mystery": "Misterio",
  "Psychological": "Psicológico",
  "Romance": "Romance",
  "Sci-Fi": "Ciencia Ficción",
  "Slice of Life": "Slice of Life",
  "Sports": "Deportes",
  "Supernatural": "Sobrenatural",
  "Thriller": "Misterio"
};

function translateGenre(name) {
  return ANILIST_GENRE_ES[name] || name;
}

/* Consulta GraphQL de búsqueda: pedimos justo los campos que usamos
   luego en mapAniListItem(), incluyendo el tráiler cuando existe. */
const ANILIST_SEARCH_QUERY = `
query ($search: String, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      description(asHtml: false)
      genres
      averageScore
      startDate { year }
      studios(isMain: true) { nodes { name } }
      coverImage { extraLarge large }
      bannerImage
      episodes
      status
      siteUrl
      trailer { id site thumbnail }
    }
  }
}`;

async function anilistRequest(query, variables, attempt = 1) {
  // Reintenta automáticamente si AniList responde 429 (límite de
  // peticiones) o 502/503/504 (servidor con problemas temporales), y
  // distingue errores de red/CORS de errores HTTP normales para poder
  // mostrar un mensaje útil.
  let res;
  try {
    res = await fetch(ANILIST_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables })
    });
  } catch (err) {
    // fetch() solo lanza aquí por fallas de red, CORS bloqueado por el
    // navegador, o porque la página se abrió con doble clic (protocolo
    // file://) en vez de servirse por http(s). Lo marcamos aparte para
    // poder dar un mensaje distinto al de "sin resultados" o "429".
    const netErr = new Error("network");
    netErr.cause = err;
    throw netErr;
  }

  if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < 4) {
    // 429: límite de peticiones. AniList suele avisar cuánto esperar
    // en el encabezado Retry-After (segundos); si no viene, usamos un
    // backoff progresivo. 502/503/504: AniList con problemas temporales.
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : 900 * attempt;
    await new Promise(r => setTimeout(r, waitMs));
    return anilistRequest(query, variables, attempt + 1);
  }

  if (!res.ok) {
    const httpErr = new Error(`http-${res.status}`);
    httpErr.status = res.status;
    throw httpErr;
  }

  const json = await res.json();
  if (json.errors && json.errors.length) {
    const gqlErr = new Error("graphql");
    gqlErr.status = json.errors[0].status || null;
    gqlErr.detail = json.errors[0].message || "";
    throw gqlErr;
  }
  return json.data;
}

async function searchAniListAnime(query) {
  const data = await anilistRequest(ANILIST_SEARCH_QUERY, { search: query, perPage: 12 });
  const media = (data && data.Page && data.Page.media) || [];
  return media.map(mapAniListItem);
}

/* AniList entrega la sinopsis con saltos de línea (y a veces alguna
   etiqueta suelta tipo <br> o <i>) en vez de HTML completo; igual la
   limpiamos por si acaso y nos quedamos con el primer párrafo. */
function stripHtml(text) {
  return String(text || "").replace(/<[^>]*>/g, "").trim();
}

function trailerEmbedUrl(trailer) {
  if (!trailer || !trailer.id) return null;
  if (trailer.site === "youtube") return `https://www.youtube.com/embed/${trailer.id}`;
  if (trailer.site === "dailymotion") return `https://www.dailymotion.com/embed/video/${trailer.id}`;
  return null;
}

function mapAniListItem(item) {
  const cover = (item.coverImage && (item.coverImage.extraLarge || item.coverImage.large)) || "";
  const description = stripHtml(item.description);
  const synopsisFirstPara = description ? description.split(/\n+/)[0] : "";

  return {
    anilistId: item.id,
    title: (item.title && (item.title.english || item.title.romaji || item.title.native)) || "Sin título",
    originalTitle: (item.title && item.title.romaji) || "",
    synopsis: synopsisFirstPara,
    genres: (item.genres || []).map(g => translateGenre(g)),
    rating: item.averageScore ? Math.round(item.averageScore) / 10 : 0,
    year: (item.startDate && item.startDate.year) || null,
    studio: (item.studios && item.studios.nodes && item.studios.nodes.length)
      ? item.studios.nodes.map(s => s.name).join(", ")
      : "Estudio desconocido",
    cover,
    banner: item.bannerImage || cover,
    episodesCount: item.episodes || null,
    status: item.status || "",
    anilistUrl: item.siteUrl || "",
    trailerEmbedUrl: trailerEmbedUrl(item.trailer),
    trailerThumb: (item.trailer && item.trailer.thumbnail) || ""
  };
}

/* Comprobación rápida de conexión con AniList ("ping"). Pide el
   recurso más liviano posible (un único id de media) y mide el tiempo
   de respuesta, sin consumir la cuota de búsquedas de verdad.
   Devuelve { ok, status, ms } o { ok:false, ms, error } si falla la red. */
async function pingAniList() {
  const start = performance.now();
  try {
    const res = await fetch(ANILIST_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ query: "query { Media(id: 1) { id } }" })
    });
    const ms = Math.round(performance.now() - start);
    return { ok: res.ok, status: res.status, ms };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    return { ok: false, status: null, ms, error: err };
  }
}
