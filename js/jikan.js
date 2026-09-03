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

/* Busca animes en Jikan y devuelve un array ya mapeado al formato
   que entiende addAnimeToLibrary() (ver js/store.js). */
async function searchJikanAnime(query) {
  const url = `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=12&sfw=true&order_by=popularity`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jikan respondió con estado ${res.status}`);
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
