/* ============================================================
   FicticionalTV — Integración con Jikan API (MyAnimeList)
   Documentación: https://docs.api.jikan.moe/
   Solo se usa en el panel de administración (admin.html).
   ============================================================ */

const JIKAN_BASE = "https://api.jikan.moe/v4";

/* Traducción aproximada de géneros de Jikan a las etiquetas en
   español que ya usa el sitio (ver GENRES en data.js). Los géneros
   sin traducción se dejan tal cual llegan de la API. */
const JIKAN_GENRE_ES = {
  "Action": "Acción",
  "Adventure": "Aventura",
  "Comedy": "Comedia",
  "Drama": "Drama",
  "Fantasy": "Fantasía",
  "Horror": "Terror",
  "Mystery": "Misterio",
  "Romance": "Romance",
  "Sci-Fi": "Ciencia Ficción",
  "Slice of Life": "Slice of Life",
  "Sports": "Deportes",
  "Supernatural": "Sobrenatural",
  "Suspense": "Misterio",
  "Isekai": "Isekai",
  "Shounen": "Shonen",
  "Shoujo": "Shojo",
  "Seinen": "Seinen",
  "Josei": "Josei",
  "Mecha": "Fantasía",
  "Music": "Música",
  "Gourmet": "Slice of Life"
};

function translateGenre(name) {
  return JIKAN_GENRE_ES[name] || name;
}

async function searchJikanAnime(query, attempt = 1) {
  // Reintenta automáticamente si Jikan responde 429 (límite de peticiones)
  // o 502/503/504 (servidor con problemas temporales), y distingue errores
  // de red/CORS de errores HTTP normales para poder mostrar un mensaje útil.
  const url = `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=12&sfw=true&order_by=popularity`;

  let res;
  try {
    res = await fetch(url);
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
    // 429: límite de peticiones. 502/503/504: Jikan/MAL con problemas temporales.
    await new Promise(r => setTimeout(r, 900 * attempt));
    return searchJikanAnime(query, attempt + 1);
  }

  if (!res.ok) {
    const httpErr = new Error(`http-${res.status}`);
    httpErr.status = res.status;
    throw httpErr;
  }

  const json = await res.json();
  return (json.data || []).map(mapJikanItem);
}

function mapJikanItem(item) {
  const images = item.images && (item.images.webp || item.images.jpg) || {};
  const cover = images.large_image_url || images.image_url || "";
  const synopsisFirstPara = item.synopsis ? item.synopsis.split(/\n+/)[0] : "";

  return {
    malId: item.mal_id,
    title: item.title_spanish || item.title || item.title_english || "Sin título",
    originalTitle: item.title || "",
    synopsis: synopsisFirstPara,
    genres: (item.genres || []).concat(item.themes || []).map(g => translateGenre(g.name)),
    rating: item.score || 0,
    year: item.year || (item.aired && item.aired.prop && item.aired.prop.from && item.aired.prop.from.year) || null,
    studio: (item.studios && item.studios.length) ? item.studios.map(s => s.name).join(", ") : "Estudio desconocido",
    cover,
    banner: cover,
    episodesCount: item.episodes || null,
    status: item.status || "",
    malUrl: item.url || ""
  };
}

/* Comprobación rápida de conexión con Jikan ("ping"). Pide el recurso
   más liviano posible (/genres/anime) y mide el tiempo de respuesta,
   sin consumir la cuota de búsquedas de verdad. Devuelve
   { ok, status, ms } o { ok:false, ms, error } si falla la red. */
async function pingJikan() {
  const start = performance.now();
  try {
    const res = await fetch(`${JIKAN_BASE}/genres/anime`, { cache: "no-store" });
    const ms = Math.round(performance.now() - start);
    return { ok: res.ok, status: res.status, ms };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    return { ok: false, status: null, ms, error: err };
  }
}
