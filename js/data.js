/* ============================================================
   FicticionalTV — datos de prueba (mock data)
   Todos los títulos, estudios y sinopsis son ficticios.
   Las imágenes son marcadores de posición generados dinámicamente
   (no son artes oficiales de ninguna obra real).
   ============================================================ */

const GENRES = [
  "Acción", "Romance", "Isekai", "Shonen", "Ciencia Ficción",
  "Comedia", "Fantasía", "Slice of Life", "Misterio", "Drama", "Aventura"
];

function coverUrl(seed) {
  return `https://picsum.photos/seed/ftv-${seed}/400/560`;
}
function bannerUrl(seed) {
  return `https://picsum.photos/seed/ftv-${seed}-wide/1600/720`;
}
function epThumbUrl(seed, ep) {
  return `https://picsum.photos/seed/ftv-${seed}-ep${ep}/480/270`;
}

function makeEpisodes(seed, count) {
  const eps = [];
  for (let i = 1; i <= count; i++) {
    eps.push({
      number: i,
      title: `Episodio ${i}`,
      thumb: epThumbUrl(seed, i),
      duration: "23 min",
      embedUrl: null // se completa desde el panel de administración
    });
  }
  return eps;
}

/* Catálogo semilla. En tiempo de ejecución, js/store.js combina esta lista
   con los animes agregados desde el panel (AniList API) y con cualquier
   cambio guardado en localStorage, exponiendo todo a través de ANIME_LIST. */
const SEED_ANIME_LIST = [
  {
    id: "shadow-blade-chronicles",
    title: "Shadow Blade Chronicles",
    synopsis: "Un espadachín sin memoria despierta en una ciudad flotante en guerra y debe elegir entre dos facciones que se disputan el último fragmento de un arma legendaria.",
    genres: ["Acción", "Fantasía"],
    rating: 9.6,
    year: 2024,
    studio: "Aurora Forge Studios",
    popularityRank: 1,
    recent: true,
    episodesCount: 12
  },
  {
    id: "neon-ronin",
    title: "Neon Ronin",
    synopsis: "En una metrópolis cyberpunk gobernada por corporaciones, una ronin exiliada acepta contratos imposibles para pagar la deuda que la separa de su clan.",
    genres: ["Ciencia Ficción", "Acción"],
    rating: 9.2,
    year: 2023,
    studio: "Kitsune Ray Animation",
    popularityRank: 3,
    recent: false,
    episodesCount: 24
  },
  {
    id: "sakura-drift",
    title: "Sakura Drift",
    synopsis: "Dos compañeros de instituto que compiten en un club de ciclismo descubren que la distancia más difícil de recorrer es la que hay entre la amistad y algo más.",
    genres: ["Slice of Life", "Romance"],
    rating: 8.8,
    year: 2022,
    studio: "Nightglass Animation Co.",
    popularityRank: 7,
    recent: false,
    episodesCount: 13
  },
  {
    id: "isekai-tavern",
    title: "Isekai Tavern",
    synopsis: "Tras morir de forma absurda, un cocinero es transportado a un mundo de fantasía donde abre una taberna que termina cambiando el destino del reino.",
    genres: ["Isekai", "Comedia"],
    rating: 9.4,
    year: 2024,
    studio: "Lantern Peak Studio",
    popularityRank: 2,
    recent: true,
    episodesCount: 12
  },
  {
    id: "crimson-eclipse",
    title: "Crimson Eclipse",
    synopsis: "Un joven cazador de eclipses debe entrenar sus poderes ancestrales antes de que una alineación cósmica libere a una entidad que su clan lleva siglos conteniendo.",
    genres: ["Shonen", "Acción"],
    rating: 9.8,
    year: 2021,
    studio: "Aurora Forge Studios",
    popularityRank: 1,
    recent: false,
    episodesCount: 26
  },
  {
    id: "whispering-static",
    title: "Whispering Static",
    synopsis: "Una operadora de radio en una estación remota empieza a recibir transmisiones de un futuro que aún no ha ocurrido, y debe decidir qué advertencias vale la pena escuchar.",
    genres: ["Misterio", "Ciencia Ficción"],
    rating: 8.6,
    year: 2023,
    studio: "Nightglass Animation Co.",
    popularityRank: 8,
    recent: false,
    episodesCount: 11
  },
  {
    id: "moonlit-academy",
    title: "Moonlit Academy",
    synopsis: "En una academia nocturna para estudiantes con dones inusuales, una nueva alumna intenta pasar desapercibida, algo casi imposible cuando cada profesor tiene un secreto propio.",
    genres: ["Romance", "Comedia"],
    rating: 8.4,
    year: 2022,
    studio: "Lantern Peak Studio",
    popularityRank: 9,
    recent: false,
    episodesCount: 13
  },
  {
    id: "iron-phoenix-legion",
    title: "Iron Phoenix Legion",
    synopsis: "Un escuadrón de jóvenes pilotos hereda mechas oxidados de una guerra olvidada y debe reconstruir tanto las máquinas como la confianza entre ellos para enfrentar la próxima invasión.",
    genres: ["Shonen", "Fantasía"],
    rating: 9.0,
    year: 2024,
    studio: "Kitsune Ray Animation",
    popularityRank: 4,
    recent: true,
    episodesCount: 12
  },
  {
    id: "starlit-wanderer",
    title: "Starlit Wanderer",
    synopsis: "Reencarnada como la última guardiana de un mapa estelar, una viajera reúne un grupo de inadaptados para cruzar un continente que cambia de forma cada luna llena.",
    genres: ["Isekai", "Aventura"],
    rating: 9.2,
    year: 2023,
    studio: "Aurora Forge Studios",
    popularityRank: 5,
    recent: false,
    episodesCount: 24
  },
  {
    id: "paper-lantern-nights",
    title: "Paper Lantern Nights",
    synopsis: "En un pueblo costero que se prepara para su último festival antes de ser reubicado, tres generaciones de una misma familia enfrentan lo que significa dejar ir un lugar.",
    genres: ["Slice of Life", "Drama"],
    rating: 9.4,
    year: 2021,
    studio: "Nightglass Animation Co.",
    popularityRank: 6,
    recent: false,
    episodesCount: 10
  },
  {
    id: "void-walkers",
    title: "Void Walkers",
    synopsis: "Una tripulación de exploradores del vacío descubre que cada salto interestelar los acerca a una verdad que la agencia que los envió preferiría mantener oculta.",
    genres: ["Ciencia Ficción", "Acción"],
    rating: 8.8,
    year: 2022,
    studio: "Kitsune Ray Animation",
    popularityRank: 10,
    recent: false,
    episodesCount: 22
  },
  {
    id: "sweet-static-hearts",
    title: "Sweet Static Hearts",
    synopsis: "Una idol en horas bajas y un ingeniero de sonido sin ambición forman, sin querer, el dúo musical que ninguno de los dos sabía que necesitaba.",
    genres: ["Romance", "Comedia"],
    rating: 8.2,
    year: 2024,
    studio: "Lantern Peak Studio",
    popularityRank: 12,
    recent: true,
    episodesCount: 12
  }
];

// Enriquecer con imágenes y episodios generados
SEED_ANIME_LIST.forEach(a => {
  a.cover = coverUrl(a.id);
  a.banner = bannerUrl(a.id);
  a.episodes = makeEpisodes(a.id, a.episodesCount);
  a.source = "seed";
  a.anilistId = null;
  a.trailerEmbedUrl = null; // los animes de la semilla son ficticios y no tienen tráiler real
});

/* ============================================================
   Normalización de links de video (tráiler y capítulos)
   ------------------------------------------------------------
   Convierte el link "normal" que se copia de la barra de
   direcciones (el que ve cualquier persona al ver el video en el
   sitio original) en la URL de "embed" que necesita un <iframe>.
   La usa js/store.js, tanto al guardar (panel de administración)
   como al leer (por si algún registro quedó con un link viejo sin
   convertir, editado a mano en Firestore, etc.), así que sea cual
   sea el sitio donde se pegue el link, termina funcionando.

   - YouTube: watch?v=, youtu.be/, /shorts/, /live/ y hasta los
     links de /embed/ ya armados se pasan siempre por el dominio
     "youtube-nocookie.com". Además de subir menos cookies, ese
     dominio evita el "Error 153" (error de configuración del
     reproductor) que YouTube devuelve cuando no recibe un origen/
     referrer válido para autorizar la reproducción embebida.
   - Dailymotion (dailymotion.com y el acortador dai.ly) y Vimeo:
     incluyen su propia conversión a formato "embed".
   - Cualquier otro sitio (streaming embebible, etc.) se deja tal
     cual: la mayoría ya entrega directamente una URL pensada para
     usarse en un <iframe>.
   ============================================================ */
function normalizeEmbedUrl(rawUrl) {
  const url = (rawUrl || "").trim();
  if (!url) return "";

  let u;
  try {
    u = new URL(url);
  } catch (err) {
    // URL inválida: la dejamos tal cual. El <iframe> simplemente no
    // podrá cargarla y se mostrará el estado "sin video".
    return url;
  }

  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch" && u.searchParams.get("v")) {
      return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}`;
    }
    if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/live/")) {
      const id = u.pathname.split("/")[2];
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (u.pathname.startsWith("/embed/")) {
      return `https://www.youtube-nocookie.com${u.pathname}${u.search}`;
    }
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
  }

  if (host === "dailymotion.com") {
    if (u.pathname.startsWith("/embed/")) return url; // ya es un embed
    const match = u.pathname.match(/\/video\/([^_/]+)/);
    if (match) return `https://www.dailymotion.com/embed/video/${match[1]}`;
  }
  if (host === "dai.ly") {
    const id = u.pathname.slice(1);
    if (id) return `https://www.dailymotion.com/embed/video/${id}`;
  }

  if (host === "vimeo.com") {
    const match = u.pathname.match(/^\/(\d+)/);
    if (match) return `https://player.vimeo.com/video/${match[1]}`;
  }

  return url;
}
