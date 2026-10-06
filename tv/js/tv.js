/* ============================================================
   FicticionalTV · versión TV
   Aplicación de una sola página para pantallas grandes, manejada
   con el control remoto (flechas, OK y Atrás).

   Lee exactamente los mismos datos que la web (../js/store.js →
   Firestore), así que todo lo que se cargue desde el panel de
   administración aparece aquí automáticamente. No modifica nada
   del sitio original.

   Rutas (hash, para que el botón Atrás del control funcione solo):
     #/home  #/catalog  #/categories  #/reco  #/extras  #/search
     #/anime/<id>            #/extra/<id>
     #/watch/<id>/<ep>       #/watchx/<id>/<audio|video>/<num>
     #/trailer/<id>
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------- utilidades */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cssUrl(u) { return 'url("' + String(u || '').replace(/["\n\r]/g, '') + '")'; }
  function fmt(r) { return Number.isFinite(r) ? r.toFixed(1) : '0.0'; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var screen = $('#screen');
  var sidebar = $('#sidebar');
  var app = $('#app');

  /* Escala: 1rem = 1/192 del ancho de pantalla (o 1/108 del alto, el menor). */
  function fit() {
    var s = Math.min(window.innerWidth / 192, window.innerHeight / 108);
    document.documentElement.style.fontSize = s + 'px';
  }
  fit();
  window.addEventListener('resize', fit);

  /* ------------------------------------------------------------- íconos */
  function svg(path, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' + (extra || '') + '>' + path + '</svg>';
  }
  var ICON = {
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>'),
    home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
    catalog: svg('<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>'),
    film: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/>'),
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5-13-7.5z"/></svg>',
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    prev: svg('<path d="M19 5l-9 7 9 7V5zM6 5v14"/>'),
    next: svg('<path d="M5 5l9 7-9 7V5zM18 5v14"/>'),
    video: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    clapper: svg('<path d="M4 8h16v12H4zM4 8l2.5-4.5M10 8l2.5-4.5M16 8l2.5-4.5"/>')
  };

  /* --------------------------------------------------------- navegación */
  var NAV = [
    { key: 'search',     label: 'Buscar',          hash: '#/search',     icon: ICON.search },
    { key: 'home',       label: 'Inicio',          hash: '#/home',       icon: ICON.home },
    { key: 'catalog',    label: 'Catálogo',        hash: '#/catalog',    icon: ICON.catalog },
    { key: 'categories', label: 'Categorías',      hash: '#/categories', icon: ICON.tag },
    { key: 'reco',       label: 'Recomendaciones', hash: '#/reco',       icon: ICON.star },
    { key: 'extras',     label: 'Extras',          hash: '#/extras',     icon: ICON.film }
  ];
  var TOP_LEVEL = { home: 1, catalog: 1, categories: 1, reco: 1, extras: 1, search: 1 };

  function buildSidebar() {
    $('#sb-list').innerHTML = NAV.map(function (n) {
      return '<li><a class="sb-item focusable" href="' + n.hash + '" data-nav="' + n.key + '" data-fk="sb:' + n.key + '">' +
        n.icon + '<span class="sb-label">' + n.label + '</span></a></li>';
    }).join('');
  }
  function setActiveNav(key) {
    $$('.sb-item').forEach(function (e) { e.classList.toggle('is-active', e.dataset.nav === key); });
  }
  function activeNavEl() {
    return $('.sb-item.is-active') || $('.sb-item[data-nav="home"]');
  }

  /* ------------------------------------------------------------- estado */
  var state = {
    ready: false,
    navCount: 1,
    focusMem: {},
    lastFk: null,
    sort: 'fecha',
    genre: null,
    query: '',
    modal: null,
    modalOpener: null,
    heroKey: null,
    heroTimer: null,
    barTimer: null,
    barHidden: false,
    byMouse: false,
    live: true,
    isPlayer: false
  };

  /* --------------------------------------------- datos (misma fuente web) */
  function animes() {
    return ANIME_LIST.map(function (a) { return a && a.cover ? a : normalizeAnimeRecord(a); });
  }
  function extrasList() {
    return EXTRAS_LIST.map(function (x) { return x && x.cover ? x : normalizeExtraRecord(x); });
  }
  function findAnime(id) { return animes().filter(function (a) { return a.id === id; })[0]; }
  function findExtra(id) { return extrasList().filter(function (x) { return x.id === id; })[0]; }
  function sortedEps(a) { return (a.episodes || []).slice().sort(function (x, y) { return x.number - y.number; }); }
  function extraItems(x, kind) {
    return ((kind === 'video' ? x.video : x.audio) || []).slice().sort(function (p, q) { return p.number - q.number; });
  }
  function allGenres() {
    var list = (typeof GENRES !== 'undefined' ? GENRES.slice() : []);
    animes().concat(extrasList()).forEach(function (a) {
      (a.genres || []).forEach(function (g) { if (g && g !== 'Sin categoría' && list.indexOf(g) < 0) list.push(g); });
    });
    return list;
  }
  function matches(item, query) {
    var q = norm(query).trim();
    if (!q) return true;
    var hay = norm([item.title].concat(item.genres || [], [item.studio]).join(' '));
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  /* ----------------------------------------- progreso (localStorage) */
  var WATCH_KEY = 'ftv_watched_episodes';   // misma clave que la web: se comparte lo "Visto"
  var RECENT_KEY = 'ftv_tv_recent';
  function readJSON(k, fb) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } }
  function watchedSet(key) { return new Set(readJSON(WATCH_KEY, {})[key] || []); }
  function markWatched(key, n) {
    var map = readJSON(WATCH_KEY, {});
    var s = new Set(map[key] || []); s.add(n); map[key] = Array.from(s);
    writeJSON(WATCH_KEY, map);
  }
  function pushRecent(entry) {
    var list = readJSON(RECENT_KEY, []).filter(function (e) { return e.k !== entry.k; });
    list.unshift(entry);
    writeJSON(RECENT_KEY, list.slice(0, 12));
  }

  /* --------------------------------------------------- plantillas: tarjetas */
  function detailHref(kind, id) { return (kind === 'x' ? '#/extra/' : '#/anime/') + encodeURIComponent(id); }

  function posterCard(item, o) {
    o = o || {};
    var kind = o.kind || 'a';
    var genres = (item.genres || []).slice(0, 2).join(' · ');
    return '<a class="card focusable" href="' + detailHref(kind, item.id) + '" data-fk="' + esc(o.fk || ('c:' + kind + item.id)) + '" data-hero="' + kind + ':' + esc(item.id) + '">' +
      '<div class="poster"><img src="' + esc(item.cover) + '" alt="" decoding="async">' +
      (o.badge ? '<span class="badge">' + esc(o.badge) + '</span>' : '') +
      '<span class="badge badge-r">★ ' + fmt(item.rating) + '</span></div>' +
      '<div class="card-title">' + esc(item.title) + '</div>' +
      '<div class="card-sub">' + esc(genres) + '</div></a>';
  }

  function rankCard(item, n, fk) {
    var genres = (item.genres || []).slice(0, 2).join(' · ');
    return '<a class="card rank focusable" href="' + detailHref('a', item.id) + '" data-fk="' + esc(fk) + '" data-hero="a:' + esc(item.id) + '">' +
      '<span class="rank-n">' + n + '</span>' +
      '<div class="poster"><img src="' + esc(item.cover) + '" alt="" decoding="async"><span class="badge badge-r">★ ' + fmt(item.rating) + '</span></div>' +
      '<div class="card-title">' + esc(item.title) + '</div><div class="card-sub">' + esc(genres) + '</div></a>';
  }

  /* Tarjeta horizontal (episodios, "continuar viendo") */
  function wideCard(o) {
    return '<a class="card wide focusable" href="' + o.href + '" data-fk="' + esc(o.fk) + '"' + (o.hero ? ' data-hero="' + esc(o.hero) + '"' : '') + '>' +
      '<div class="thumb"><img src="' + esc(o.thumb) + '" alt="" decoding="async">' +
      (o.tag ? '<span class="badge badge-ep">' + esc(o.tag) + '</span>' : '') +
      (o.seen ? '<span class="badge badge-seen">' + ICON.check + '</span>' : '') + '</div>' +
      '<div class="card-title">' + esc(o.title) + '</div>' +
      '<div class="card-sub">' + esc(o.sub || '') + '</div></a>';
  }

  function rowHtml(id, title, cards, align) {
    return '<section class="row"' + (align != null ? ' data-align="' + align + '"' : '') + '>' +
      '<h2 class="row-title">' + esc(title) + '</h2><div class="rail" id="rail-' + id + '">' + cards + '</div></section>';
  }

  function emptyView(title, text, withHome) {
    return {
      html: '<div class="empty"><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
        (withHome === false ? '' : '<a class="btn btn-primary focusable" href="#/home" data-fk="empty:home" data-autofocus>' + ICON.home + '<span>Ir al inicio</span></a>') + '</div>'
    };
  }

  /* ------------------------------------------------------- reproducir: lógica */
  function nextEpisodeFor(a) {
    var eps = sortedEps(a);
    if (!eps.length) return null;
    var w = watchedSet('anime:' + a.id);
    var ep = eps.filter(function (e) { return !w.has(e.number); })[0];
    var label;
    if (!w.size) { ep = eps[0]; label = 'Ver episodio ' + ep.number; }
    else if (!ep) { ep = eps[0]; label = 'Volver a ver'; }
    else label = 'Continuar · Episodio ' + ep.number;
    return { ep: ep, label: label, href: '#/watch/' + encodeURIComponent(a.id) + '/' + ep.number };
  }

  /* ============================================================ VISTAS */
  var VIEWS = {};

  /* ---------------------------------------------------------------- Inicio */
  VIEWS.home = { nav: 'home', live: true, view: function () {
    var L = animes(), X = extrasList();
    if (!L.length && !X.length) return emptyView('Todavía no hay contenido', 'En cuanto se agregue contenido desde el panel de administración aparecerá aquí.', false);

    var rows = '', idx = 0;

    // Continuar viendo
    var recents = readJSON(RECENT_KEY, []).map(function (e) {
      if (e.kind === 'x') {
        var x = findExtra(e.id); if (!x) return null;
        var it = extraItems(x, e.type).filter(function (i) { return i.number === e.n; })[0]; if (!it) return null;
        return wideCard({ href: '#/watchx/' + encodeURIComponent(x.id) + '/' + e.type + '/' + it.number, thumb: it.thumb, tag: (e.type === 'video' ? 'V' : 'A') + ' ' + it.number,
          title: x.title, sub: it.title, fk: 'cont:x' + x.id, hero: 'x:' + x.id });
      }
      var a = findAnime(e.id); if (!a) return null;
      var ep = sortedEps(a).filter(function (i) { return i.number === e.n; })[0]; if (!ep) return null;
      return wideCard({ href: '#/watch/' + encodeURIComponent(a.id) + '/' + ep.number, thumb: ep.thumb, tag: 'EP ' + ep.number,
        title: a.title, sub: ep.title, fk: 'cont:a' + a.id, hero: 'a:' + a.id });
    }).filter(Boolean);
    if (recents.length) rows += rowHtml('cont', 'Continuar viendo', recents.join(''), idx++);

    var featured = L.filter(function (a) { return a.recent; });
    if (featured.length) rows += rowHtml('feat', 'Destacados', featured.map(function (a) { return posterCard(a, { badge: 'Destacado', fk: 'feat:' + a.id }); }).join(''), idx++);

    var top = L.slice().sort(function (a, b) { return a.popularityRank - b.popularityRank; }).slice(0, 10);
    if (top.length) rows += rowHtml('top', 'Top 10 de la semana', top.map(function (a, i) { return rankCard(a, i + 1, 'top:' + a.id); }).join(''), idx++);

    var upcoming = L.filter(function (a) { return !a.episodes || !a.episodes.length; });
    if (upcoming.length) rows += rowHtml('soon', 'Próximamente', upcoming.map(function (a) { return posterCard(a, { badge: 'Próximamente', fk: 'soon:' + a.id }); }).join(''), idx++);

    var best = L.slice().sort(function (a, b) { return (b.rating - a.rating) || (b.year - a.year); }).slice(0, 12);
    if (best.length > 3) rows += rowHtml('best', 'Mejor calificados', best.map(function (a) { return posterCard(a, { fk: 'best:' + a.id }); }).join(''), idx++);

    if (X.length) rows += rowHtml('extras', 'Extras', X.map(function (x) { return posterCard(x, { kind: 'x', fk: 'ex:' + x.id }); }).join(''), idx++);

    var html =
      '<div class="home" id="home">' +
        '<div class="backdrop" id="backdrop"></div><div class="bd-shade"></div><div class="bd-dim"></div>' +
        '<div class="hero-info" id="hero-info">' +
          '<div class="hero-text" id="hero-text"></div>' +
          '<div class="btn-row">' +
            '<a class="btn btn-primary focusable" id="hero-play" href="#/catalog" data-fk="hero:play" data-autofocus>' + ICON.play + '<span>Ver ahora</span></a>' +
            '<a class="btn focusable" id="hero-more" href="#/catalog" data-fk="hero:more">' + ICON.info + '<span>Más información</span></a>' +
          '</div>' +
        '</div>' +
        '<div class="rows">' + rows + '</div>' +
      '</div>';

    return { html: html, after: function () {
      var first = featured[0] || top[0] || L[0];
      if (first) setHero('a', first.id, true); else if (X[0]) setHero('x', X[0].id, true);
    } };
  } };

  /* Actualiza el billboard (fondo + textos + botones) del inicio */
  function setHero(kind, id, instant) {
    var item = kind === 'x' ? findExtra(id) : findAnime(id);
    var text = $('#hero-text');
    if (!item || !text) return;
    var key = kind + ':' + id;
    if (state.heroKey === key && !instant) return;
    state.heroKey = key;

    // Botones
    var play = $('#hero-play'), more = $('#hero-more');
    if (kind === 'a') {
      var np = nextEpisodeFor(item);
      play.setAttribute('href', np ? np.href : detailHref('a', item.id));
      $('span', play).textContent = np ? np.label : 'Ver ficha';
    } else {
      play.setAttribute('href', detailHref('x', item.id));
      $('span', play).textContent = 'Ver extra';
    }
    more.setAttribute('href', detailHref(kind, item.id));

    // Fondo con cross-fade (precarga para no mostrar parpadeos)
    var bd = $('#backdrop');
    var img = new Image();
    var add = function () {
      if (state.heroKey !== key || !$('#backdrop')) return;
      var layer = document.createElement('div');
      layer.className = 'bd-layer';
      layer.style.backgroundImage = cssUrl(item.banner);
      bd.appendChild(layer);
      requestAnimationFrame(function () { requestAnimationFrame(function () { layer.classList.add('in'); }); });
      setTimeout(function () { while (bd.children.length > 2) bd.removeChild(bd.firstChild); }, 800);
    };
    img.onload = add; img.onerror = add; img.src = item.banner;

    // Textos
    var count = kind === 'a' ? plural((item.episodes || []).length, 'episodio', 'episodios')
      : plural((item.audio || []).length + (item.video || []).length, 'video', 'videos');
    var fill = function () {
      text.innerHTML =
        '<div class="hero-tags">' + esc((item.genres || []).slice(0, 3).join('  ·  ')) + '</div>' +
        (item.logo ? '<img class="hero-logo" src="' + esc(item.logo) + '" alt="' + esc(item.title) + '">' : '<h1 class="hero-title">' + esc(item.title) + '</h1>') +
        '<div class="meta"><span class="star">★ ' + fmt(item.rating) + '</span><span class="dot">•</span>' + esc(item.year) + '<span class="dot">•</span>' + esc(count) + '</div>' +
        '<p class="synopsis">' + esc(item.synopsis) + '</p>';
      text.classList.remove('out');
    };
    if (instant) fill(); else { text.classList.add('out'); setTimeout(function () { if (state.heroKey === key) fill(); }, 140); }
  }

  /* -------------------------------------------------------------- Catálogo */
  var SORTS = [
    { v: 'fecha', l: 'Más recientes' },
    { v: 'popularidad', l: 'Populares' },
    { v: 'alfabetico', l: 'A – Z' }
  ];
  function sortAnimes(list, by) {
    var c = list.slice();
    if (by === 'popularidad') return c.sort(function (a, b) { return a.popularityRank - b.popularityRank; });
    if (by === 'alfabetico') return c.sort(function (a, b) { return a.title.localeCompare(b.title); });
    return c.sort(function (a, b) { return b.year - a.year; });
  }
  function catalogGrid() {
    var list = sortAnimes(animes(), state.sort);
    $('#grid-count').textContent = plural(list.length, 'título', 'títulos');
    $('#grid-area').innerHTML = list.length
      ? '<div class="grid">' + list.map(function (a) { return posterCard(a, { badge: a.recent ? 'Nuevo' : '', fk: 'cat:' + a.id }); }).join('') + '</div>'
      : '<div class="empty"><h2>Sin resultados</h2></div>';
    $$('.chip[data-act="sort"]').forEach(function (c) { c.classList.toggle('is-active', c.dataset.val === state.sort); });
  }
  VIEWS.catalog = { nav: 'catalog', live: true, view: function () {
    return { html:
      '<div class="page-head"><h1>Catálogo</h1><p>Todo el doblaje indie en español latino</p></div>' +
      '<div class="chips">' + SORTS.map(function (s, i) {
        return '<button class="chip focusable" data-act="sort" data-val="' + s.v + '" data-fk="sort:' + s.v + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + s.l + '</button>';
      }).join('') + '</div>' +
      '<div class="count" id="grid-count"></div><div id="grid-area"></div>',
      after: catalogGrid };
  } };

  /* ------------------------------------------------------------ Categorías */
  function genreGrid() {
    var g = state.genre;
    var list = animes().filter(function (a) { return (a.genres || []).indexOf(g) >= 0; });
    $('#grid-count').textContent = g + ' · ' + plural(list.length, 'título', 'títulos');
    $('#grid-area').innerHTML = list.length
      ? '<div class="grid">' + list.map(function (a) { return posterCard(a, { badge: a.recent ? 'Nuevo' : '', fk: 'gen:' + a.id }); }).join('') + '</div>'
      : '<div class="empty" style="padding-top:6rem"><h2>Aún no hay títulos en ' + esc(g) + '</h2><p>Prueba con otra categoría.</p></div>';
    $$('.chip[data-act="genre"]').forEach(function (c) { c.classList.toggle('is-active', c.dataset.val === g); });
  }
  VIEWS.categories = { nav: 'categories', live: true, view: function () {
    var list = animes();
    var genres = allGenres();
    if (!state.genre || genres.indexOf(state.genre) < 0) {
      state.genre = genres.filter(function (g) { return list.some(function (a) { return (a.genres || []).indexOf(g) >= 0; }); })[0] || genres[0];
    }
    return { html:
      '<div class="page-head"><h1>Categorías</h1><p>Elige un género y pulsa OK</p></div>' +
      '<div class="chips">' + genres.map(function (g) {
        var n = list.filter(function (a) { return (a.genres || []).indexOf(g) >= 0; }).length;
        return '<button class="chip focusable" data-act="genre" data-val="' + esc(g) + '" data-fk="genre:' + esc(g) + '"' + (g === state.genre ? ' data-autofocus' : '') + '>' + esc(g) + '<small>' + n + '</small></button>';
      }).join('') + '</div>' +
      '<div class="count" id="grid-count"></div><div id="grid-area"></div>',
      after: genreGrid };
  } };

  /* -------------------------------------------------------- Recomendaciones */
  VIEWS.reco = { nav: 'reco', live: true, view: function () {
    var list = animes().sort(function (a, b) { return (b.rating - a.rating) || (b.year - a.year); });
    return { html:
      '<div class="page-head"><h1>Recomendaciones</h1><p>Ordenadas por calificación, de mayor a menor</p></div>' +
      '<div class="count">' + plural(list.length, 'título', 'títulos') + '</div>' +
      (list.length ? '<div class="grid">' + list.map(function (a, i) { return posterCard(a, { badge: i === 0 ? 'N.º 1' : '', fk: 'rec:' + a.id }); }).join('') + '</div>' : '') };
  } };

  /* ---------------------------------------------------------------- Extras */
  VIEWS.extras = { nav: 'extras', live: true, view: function () {
    var list = extrasList().sort(function (a, b) { return (a.popularityRank || 0) - (b.popularityRank || 0); });
    if (!list.length) return emptyView('Todavía no hay extras', 'Aquí aparecerán los videos y audios adicionales cuando se carguen.');
    return { html:
      '<div class="page-head"><h1>Extras</h1><p>Contenido adicional de FicticionalTV</p></div>' +
      '<div class="count">' + plural(list.length, 'extra', 'extras') + '</div>' +
      '<div class="grid">' + list.map(function (x) { return posterCard(x, { kind: 'x', fk: 'xx:' + x.id }); }).join('') + '</div>' };
  } };

  /* ------------------------------------------------------------- Búsqueda */
  var KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  function searchResults() {
    var q = state.query.trim();
    var box = $('#search-results'); if (!box) return;
    var L = animes(), X = extrasList(), html;
    if (!q) {
      var pop = L.slice().sort(function (a, b) { return a.popularityRank - b.popularityRank; }).slice(0, 10);
      html = '<h2>Populares ahora</h2><div class="grid grid-sm">' + pop.map(function (a) { return posterCard(a, { fk: 'sr:' + a.id }); }).join('') + '</div>';
    } else {
      var ra = L.filter(function (a) { return matches(a, q); });
      var rx = X.filter(function (x) { return matches(x, q); });
      var n = ra.length + rx.length;
      html = n
        ? '<h2>' + plural(n, 'resultado', 'resultados') + '</h2><div class="grid grid-sm">' +
          ra.map(function (a) { return posterCard(a, { fk: 'sr:' + a.id }); }).join('') +
          rx.map(function (x) { return posterCard(x, { kind: 'x', fk: 'sx:' + x.id }); }).join('') + '</div>'
        : '<p class="no-results">No encontramos nada para «' + esc(q) + '».<br>Prueba con otro título, género o estudio.</p>';
    }
    box.innerHTML = html;
    var sq = $('#sq');
    if (sq) sq.innerHTML = (q ? esc(state.query) : '<span class="ph">Escribe un título…</span>') + '<span class="caret"></span>';
  }
  VIEWS.search = { nav: 'search', live: false, view: function () {
    var keys = KEYS.map(function (k, i) {
      return '<button class="key focusable" data-act="key" data-ch="' + k + '" data-fk="k:' + k + '"' + (i === 0 ? ' data-autofocus' : '') + '>' + k + '</button>';
    }).join('');
    return { html:
      '<div class="search">' +
        '<div class="search-left"><div class="sq" id="sq"></div>' +
          '<div class="keys">' + keys +
            '<button class="key fn s2 focusable" data-act="space" data-fk="k:space">Espacio</button>' +
            '<button class="key fn s2 focusable" data-act="del" data-fk="k:del">Borrar</button>' +
            '<button class="key fn s2 focusable" data-act="clear" data-fk="k:clear">Limpiar</button>' +
          '</div></div>' +
        '<div class="search-right" id="search-results"></div>' +
      '</div>', after: searchResults };
  } };
  function typeChar(ch) { state.query += ch; searchResults(); }

  /* ----------------------------------------------------- Ficha de un anime */
  function detailTop(item, kind, buttons, extraMeta) {
    return '<div class="detail-bd" data-bg="' + esc(item.banner) + '"></div><div class="bd-shade"></div>' +
      '<div class="detail"><section class="detail-top"><div class="detail-info">' +
        '<div class="hero-tags">' + esc((item.genres || []).join('  ·  ')) + '</div>' +
        (item.logo ? '<img class="hero-logo" src="' + esc(item.logo) + '" alt="' + esc(item.title) + '">' : '<h1 class="hero-title">' + esc(item.title) + '</h1>') +
        '<div class="meta"><span class="star">★ ' + fmt(item.rating) + '</span><span class="dot">•</span>' + esc(item.year) + '<span class="dot">•</span>' + esc(item.studio) + '<span class="dot">•</span>' + esc(extraMeta) + '</div>' +
        '<p class="synopsis">' + esc(item.synopsis) + '</p>' +
        '<div class="btn-row">' + buttons + '</div>' +
      '</div><img class="detail-poster" src="' + esc(item.cover) + '" alt=""></section>';
  }
  VIEWS.anime = { nav: null, live: true, view: function (r) {
    var a = findAnime(r.args[0]);
    if (!a) return emptyView('No encontramos este anime', 'Puede que haya sido retirado del catálogo.');
    var eps = sortedEps(a), np = nextEpisodeFor(a), seen = watchedSet('anime:' + a.id);
    var buttons =
      (np ? '<a class="btn btn-primary focusable" href="' + np.href + '" data-fk="d:play" data-autofocus>' + ICON.play + '<span>' + esc(np.label) + '</span></a>'
          : '<span class="btn btn-disabled">Próximamente</span>') +
      (a.trailerEmbedUrl ? '<a class="btn focusable" href="#/trailer/' + encodeURIComponent(a.id) + '" data-fk="d:trailer">' + ICON.clapper + '<span>Tráiler</span></a>' : '') +
      '<button class="btn focusable" data-act="details" data-kind="a" data-id="' + esc(a.id) + '" data-fk="d:info">' + ICON.info + '<span>Detalles</span></button>';
    var html = detailTop(a, 'a', buttons, plural(eps.length, 'episodio', 'episodios'));
    if (eps.length) {
      html += rowHtml('eps', 'Episodios', eps.map(function (ep) {
        return wideCard({ href: '#/watch/' + encodeURIComponent(a.id) + '/' + ep.number, thumb: ep.thumb, tag: 'EP ' + ep.number,
          title: ep.title, sub: ep.embedUrl ? ep.duration : 'Sin video', fk: 'ep:' + ep.number, seen: seen.has(ep.number) });
      }).join(''));
    }
    return { html: html + '</div>' };
  } };

  /* ----------------------------------------------------- Ficha de un extra */
  VIEWS.extra = { nav: null, live: true, view: function (r) {
    var x = findExtra(r.args[0]);
    if (!x) return emptyView('No encontramos este extra', 'Puede que haya sido retirado.');
    var aud = extraItems(x, 'audio'), vid = extraItems(x, 'video');
    var first = vid[0] ? { t: 'video', i: vid[0] } : (aud[0] ? { t: 'audio', i: aud[0] } : null);
    var buttons =
      (first ? '<a class="btn btn-primary focusable" href="#/watchx/' + encodeURIComponent(x.id) + '/' + first.t + '/' + first.i.number + '" data-fk="d:play" data-autofocus>' + ICON.play + '<span>Reproducir</span></a>'
             : '<span class="btn btn-disabled">Sin contenido aún</span>') +
      '<button class="btn focusable" data-act="details" data-kind="x" data-id="' + esc(x.id) + '" data-fk="d:info">' + ICON.info + '<span>Detalles</span></button>';
    var html = detailTop(x, 'x', buttons, plural(aud.length + vid.length, 'video', 'videos'));
    function rail(kind, list, title) {
      if (!list.length) return '';
      var seen = watchedSet('extra:' + x.id + ':' + kind), L = kind === 'video' ? 'V' : 'A';
      return rowHtml(kind, title, list.map(function (it) {
        return wideCard({ href: '#/watchx/' + encodeURIComponent(x.id) + '/' + kind + '/' + it.number, thumb: it.thumb, tag: L + ' ' + it.number,
          title: it.title, sub: it.embedUrl ? it.duration : 'Sin video', fk: kind + ':' + it.number, seen: seen.has(it.number) });
      }).join(''));
    }
    html += rail('video', vid, 'Video') + rail('audio', aud, 'Audio');
    return { html: html + '</div>' };
  } };

  /* ------------------------------------------------------------ Reproductor */
  function withAutoplay(u) {
    if (!u) return '';
    try {
      var x = new URL(u);
      if (/(^|\.)(youtube(-nocookie)?\.com|dailymotion\.com|player\.vimeo\.com)$/.test(x.hostname)) {
        if (!x.searchParams.has('autoplay')) x.searchParams.set('autoplay', '1');
        if (/youtube/.test(x.hostname)) x.searchParams.set('rel', '0');
        return x.toString();
      }
    } catch (e) { /* url rara: se usa tal cual */ }
    return u;
  }
  function playerHtml(o) {
    var body = o.embed
      ? '<iframe id="player-frame" src="' + esc(withAutoplay(o.embed)) + '" title="' + esc(o.title) + '" allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write" allowfullscreen></iframe>'
      : '<div class="player-novideo">' + ICON.video + '<div>Este contenido todavía no tiene video configurado.</div></div>';
    return '<div class="player">' + body +
      '<div class="player-bar" id="player-bar" data-autohide="' + (o.embed ? '1' : '0') + '">' +
        '<a class="btn focusable" data-act="back" href="' + o.backHref + '" data-fk="p:back">' + ICON.back + '<span>Volver</span></a>' +
        '<div class="player-titles"><div class="player-kicker">' + esc(o.kicker) + '</div><div class="player-title">' + esc(o.title) + '</div></div>' +
        (o.prev ? '<a class="btn focusable" data-replace href="' + o.prev + '" data-fk="p:prev">' + ICON.prev + '<span>Anterior</span></a>' : '') +
        (o.next ? '<a class="btn focusable" data-replace href="' + o.next + '" data-fk="p:next">' + ICON.next + '<span>Siguiente</span></a>' : '') +
        (o.embed ? '<button class="btn btn-primary focusable" data-act="control" data-fk="p:control" data-autofocus>' + ICON.play + '<span>Controlar video</span></button>' : '') +
      '</div></div>';
  }

  VIEWS.watch = { nav: null, live: false, sidebar: false, view: function (r) {
    var a = findAnime(r.args[0]);
    var n = Number(r.args[1]) || 1;
    if (!a) return emptyView('No encontramos este anime', '');
    var eps = sortedEps(a), i = -1;
    eps.forEach(function (e, k) { if (e.number === n) i = k; });
    if (i < 0) return emptyView(a.title, 'Este episodio no existe todavía.');
    var ep = eps[i];
    markWatched('anime:' + a.id, ep.number);
    pushRecent({ k: 'anime:' + a.id, kind: 'a', id: a.id, n: ep.number });
    return { html: playerHtml({
      kicker: a.title, title: 'E' + ep.number + ' · ' + ep.title, embed: ep.embedUrl, backHref: '#/anime/' + encodeURIComponent(a.id),
      prev: eps[i - 1] ? '#/watch/' + encodeURIComponent(a.id) + '/' + eps[i - 1].number : '',
      next: eps[i + 1] ? '#/watch/' + encodeURIComponent(a.id) + '/' + eps[i + 1].number : ''
    }), after: initPlayer };
  } };

  VIEWS.watchx = { nav: null, live: false, sidebar: false, view: function (r) {
    var x = findExtra(r.args[0]);
    var kind = r.args[1] === 'video' ? 'video' : 'audio';
    var n = Number(r.args[2]) || 1;
    if (!x) return emptyView('No encontramos este extra', '');
    var items = extraItems(x, kind), i = -1;
    items.forEach(function (e, k) { if (e.number === n) i = k; });
    if (i < 0) return emptyView(x.title, 'Este contenido no existe todavía.');
    var it = items[i], L = kind === 'video' ? 'V' : 'A', base = '#/watchx/' + encodeURIComponent(x.id) + '/' + kind + '/';
    markWatched('extra:' + x.id + ':' + kind, it.number);
    pushRecent({ k: 'extra:' + x.id + ':' + kind, kind: 'x', id: x.id, type: kind, n: it.number });
    return { html: playerHtml({
      kicker: x.title, title: L + it.number + ' · ' + it.title, embed: it.embedUrl, backHref: '#/extra/' + encodeURIComponent(x.id),
      prev: items[i - 1] ? base + items[i - 1].number : '', next: items[i + 1] ? base + items[i + 1].number : ''
    }), after: initPlayer };
  } };

  VIEWS.trailer = { nav: null, live: false, sidebar: false, view: function (r) {
    var a = findAnime(r.args[0]);
    if (!a || !a.trailerEmbedUrl) return emptyView('Sin tráiler', 'Este anime todavía no tiene tráiler.');
    return { html: playerHtml({ kicker: a.title, title: 'Tráiler', embed: a.trailerEmbedUrl, backHref: '#/anime/' + encodeURIComponent(a.id) }), after: initPlayer };
  } };

  /* La barra del reproductor se oculta sola; cualquier tecla la vuelve a mostrar. */
  function initPlayer() { state.isPlayer = true; wakeBar(); }
  function wakeBar() {
    var bar = $('#player-bar'); if (!bar) return;
    clearTimeout(state.barTimer);
    bar.classList.remove('hidden'); state.barHidden = false;
    if (bar.dataset.autohide === '1') {
      state.barTimer = setTimeout(function () { bar.classList.add('hidden'); state.barHidden = true; }, 6000);
    }
  }

  /* ----------------------------------------------------------- Detalles (modal) */
  function openDetails(kind, id) {
    var it = kind === 'x' ? findExtra(id) : findAnime(id);
    if (!it) return;
    var rows = [];
    if (kind === 'a') { rows.push(['Audio', it.audio || 'Español Latino']); rows.push(['Reparto', it.cast || '—']); }
    rows.push(['Género', (it.genres || []).join(', ') || '—']); rows.push(['Estudio', it.studio || '—']); rows.push(['Año', it.year]);
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="modal-card"><h2>' + esc(it.title) + '</h2>' +
      '<div class="modal-scroll focusable scrollable" tabindex="0" data-fk="m:scroll"><p>' + esc(it.synopsis) + '</p><dl>' +
      rows.map(function (r) { return '<div class="info-row"><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl></div>' +
      '<div class="btn-row" style="margin-top:0"><button class="btn btn-primary focusable" data-act="close-modal" data-fk="m:close" data-autofocus><span>Cerrar</span></button></div></div>';
    document.body.appendChild(m);
    state.modalOpener = document.activeElement; state.modal = m;
    $('[data-autofocus]', m).focus();
  }
  function closeModal() {
    if (!state.modal) return;
    document.body.removeChild(state.modal); state.modal = null;
    if (state.modalOpener && document.body.contains(state.modalOpener)) state.modalOpener.focus();
  }

  /* =========================================================== ENRUTADOR */
  function parseRoute() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('?');
    var segs = (parts[0] || 'home').split('/').map(function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } });
    return { name: segs[0] || 'home', args: segs.slice(1), q: new URLSearchParams(parts[1] || ''), hash: location.hash || '#/home' };
  }
  function currentDef() { var r = parseRoute(); return VIEWS[r.name] || VIEWS.home; }

  function byFk(fk) {
    return $$('[data-fk]', screen).filter(function (e) { return e.dataset.fk === fk; })[0];
  }

  function render(keep) {
    clearTimeout(state.barTimer); clearTimeout(state.heroTimer);
    state.isPlayer = false; state.barHidden = false;
    if (state.modal) closeModal();

    if (!state.ready) { screen.innerHTML = '<div class="loader"><div class="spinner"></div></div>'; return; }

    var r = parseRoute();
    var def = VIEWS[r.name] || VIEWS.home;
    state.live = def.live !== false;
    state.heroKey = null;

    var prevFk = keep ? state.lastFk : null;
    var prevTop = keep ? screen.scrollTop : 0;

    var out;
    try { out = def.view(r); }
    catch (err) { console.error('FicticionalTV TV: error al pintar la vista', err); out = emptyView('Algo salió mal', 'No pudimos mostrar esta pantalla. Intenta volver al inicio.'); }

    app.classList.toggle('no-sidebar', def.sidebar === false);
    screen.innerHTML = out.html;
    screen.scrollTop = prevTop;
    $$('[data-bg]', screen).forEach(function (e) { e.style.backgroundImage = cssUrl(e.dataset.bg); });
    setActiveNav(def.nav);
    if (out.after) out.after(r);

    // Foco: el recordado de esta pantalla → el marcado como inicial → el primero.
    var target = (prevFk && byFk(prevFk)) || (!keep && state.focusMem[r.hash] && byFk(state.focusMem[r.hash])) ||
      $('[data-autofocus]', screen) || $('.focusable', screen);
    if (target) target.focus(); else screen.focus();
  }

  /* ============================================== NAVEGACIÓN ESPACIAL */
  function isVisible(e) {
    if (e.offsetWidth <= 0 || e.offsetHeight <= 0 || e.classList.contains('is-disabled')) return false;
    // El billboard del inicio se oculta cuando las filas suben: sus botones no son destino válido.
    return !e.closest('.is-scrolled .hero-info');
  }
  function nearest(cur, dir, scope) {
    var cr = cur.getBoundingClientRect();
    var cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    var best = null, bestScore = Infinity;
    $$('.focusable', scope).forEach(function (el) {
      if (el === cur || !isVisible(el)) return;
      var r = el.getBoundingClientRect();
      var ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      var prim, sec;
      if (dir === 'right') { if (ex <= cx + 2) return; prim = Math.max(0, r.left - cr.right); sec = Math.abs(ey - cy) * 3; }
      else if (dir === 'left') { if (ex >= cx - 2) return; prim = Math.max(0, cr.left - r.right); sec = Math.abs(ey - cy) * 3; }
      else if (dir === 'down') { if (ey <= cy + 2) return; prim = Math.max(0, r.top - cr.bottom); sec = Math.abs(ex - cx) * 2; }
      else { if (ey >= cy - 2) return; prim = Math.max(0, cr.top - r.bottom); sec = Math.abs(ex - cx) * 2; }
      var score = prim + sec;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function focusFirst() {
    var scope = state.modal || screen;
    var el = $('[data-autofocus]', scope) || $('.focusable', scope);
    if (el) el.focus();
  }
  function focusContent() {
    var el = state.lastFk ? byFk(state.lastFk) : null;
    el = el || $('[data-autofocus]', screen) || $('.focusable', screen);
    if (el) el.focus();
  }
  function focusSidebar() { var el = activeNavEl(); if (el) el.focus(); }

  function move(dir) {
    var cur = document.activeElement;
    var isF = cur && cur.classList && cur.classList.contains('focusable');
    var inSb = isF && sidebar.contains(cur);
    var scope = state.modal || (inSb ? sidebar : screen);
    if (!isF || !scope.contains(cur)) { focusFirst(); return; }

    // Áreas con texto largo (modal): ↑/↓ desplazan el texto antes de salir.
    if (cur.classList.contains('scrollable') && (dir === 'up' || dir === 'down')) {
      var st = cur.scrollTop, max = cur.scrollHeight - cur.clientHeight;
      if (dir === 'down' && st < max - 2) { scrollTween(cur, 'scrollTop', st + cur.clientHeight * 0.6); return; }
      if (dir === 'up' && st > 2) { scrollTween(cur, 'scrollTop', st - cur.clientHeight * 0.6); return; }
    }
    if (inSb) {
      if (dir === 'right') { focusContent(); return; }
      if (dir === 'left') return;
    }
    var next = nearest(cur, dir, scope);
    if (next) next.focus();
    else if (!inSb && !state.modal && dir === 'left') focusSidebar();
  }

  /* Desplazamiento animado (sin depender de scroll-behavior ni scrollTo(options)) */
  function scrollTween(el, prop, to, dur) {
    var tk = '_tw' + prop;
    if (el[tk]) cancelAnimationFrame(el[tk]);
    var from = el[prop]; to = Math.max(0, Math.round(to));
    if (Math.abs(to - from) < 2) { el[prop] = to; return; }
    var t0 = performance.now(); dur = dur || 240;
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el[prop] = from + (to - from) * e;
      if (p < 1) el[tk] = requestAnimationFrame(step);
    })(t0);
  }
  function contentTop(el) {
    return el.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop;
  }

  /* Mantiene a la vista lo que tiene el foco: rieles en horizontal, pantalla en vertical. */
  function ensureVisible(el) {
    if (state.modal && state.modal.contains(el)) return;
    if (sidebar.contains(el)) return;

    var rail = el.closest('.rail');
    if (rail) {
      var rr = rail.getBoundingClientRect(), er = el.getBoundingClientRect();
      var pad = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
      if (er.left < rr.left + pad * 0.6) scrollTween(rail, 'scrollLeft', rail.scrollLeft - (rr.left + pad - er.left) - er.width * 0.55);
      else if (er.right > rr.right - pad * 0.6) scrollTween(rail, 'scrollLeft', rail.scrollLeft + (er.right - rr.right) + pad + er.width * 0.4);
    }

    var vh = window.innerHeight;
    if (el.closest('.hero-info')) { scrollTween(screen, 'scrollTop', 0); return; }
    var row = el.closest('[data-align]');
    if (row) {   // Inicio: la fila enfocada sube a un lugar fijo, como en Netflix
      var idx = Number(row.dataset.align);
      scrollTween(screen, 'scrollTop', idx === 0 ? 0 : contentTop(row) - vh * 0.16);
      return;
    }
    var r = el.getBoundingClientRect(), top = contentTop(el);
    if (top < vh * 0.34) scrollTween(screen, 'scrollTop', 0);
    else if (r.top < vh * 0.1 || r.bottom > vh * 0.92) scrollTween(screen, 'scrollTop', top - vh * 0.24);
  }

  /* ================================================== EVENTOS DE TECLADO */
  function keyName(e) {
    var c = e.keyCode, k = e.key;
    if (k === 'ArrowLeft' || c === 37) return 'left';
    if (k === 'ArrowRight' || c === 39) return 'right';
    if (k === 'ArrowUp' || c === 38) return 'up';
    if (k === 'ArrowDown' || c === 40) return 'down';
    if (k === 'Enter' || c === 13) return 'enter';
    // Atrás: teclado/PC, Android TV, Tizen (Samsung) y webOS (LG)
    if (k === 'Escape' || k === 'Backspace' || k === 'BrowserBack' || k === 'GoBack' || k === 'XF86Back' ||
        c === 27 || c === 8 || c === 4 || c === 166 || c === 10009 || c === 461) return 'back';
    return null;
  }

  function exitApp() {
    try { if (window.AndroidTV) { AndroidTV.exit(); return; } } catch (e) {}
    try { if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; } } catch (e) {}
    try { if (window.webOS && webOS.platformBack) { webOS.platformBack(); return; } } catch (e) {}
    if (state.navCount > 1) history.back();
  }
  function goBack() {
    if (state.modal) { closeModal(); return; }
    var r = parseRoute();
    if (TOP_LEVEL[r.name]) {
      var inSb = sidebar.contains(document.activeElement);
      if (!inSb) { focusSidebar(); return; }
      if (r.name !== 'home') { location.hash = '#/home'; return; }
      exitApp(); return;
    }
    if (state.navCount > 1) history.back(); else location.hash = '#/home';
  }

  document.addEventListener('keydown', function (e) {
    var k = keyName(e);

    // Búsqueda: también se puede escribir con un teclado físico / control con teclado.
    if (parseRoute().name === 'search' && !state.modal && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key && e.key.length === 1 && /[a-z0-9ñáéíóúü ]/i.test(e.key)) { e.preventDefault(); typeChar(e.key.toLowerCase()); return; }
      if ((e.key === 'Backspace' || e.keyCode === 8) && state.query) { e.preventDefault(); state.query = state.query.slice(0, -1); searchResults(); return; }
    }
    if (!k) return;

    // Reproductor: si la barra estaba oculta, la primera tecla solo la muestra.
    if (state.isPlayer) {
      var wasHidden = state.barHidden;
      wakeBar();
      if (wasHidden && k !== 'back') { e.preventDefault(); return; }
    }

    if (k === 'back') { e.preventDefault(); goBack(); return; }
    if (k === 'enter') {
      var el = document.activeElement;
      if (el && el.classList && el.classList.contains('focusable')) { e.preventDefault(); el.click(); }
      return;
    }
    e.preventDefault();
    move(k);
  });

  /* ======================================================== CLICS / OK */
  document.addEventListener('click', function (e) {
    var rep = e.target.closest('a[data-replace]');
    if (rep) { e.preventDefault(); location.replace(rep.getAttribute('href')); return; }

    var sb = e.target.closest('.sb-item');
    if (sb && sb.dataset.nav === 'search') state.query = '';

    var t = e.target.closest('[data-act]');
    if (!t) return;
    switch (t.dataset.act) {
      case 'sort': state.sort = t.dataset.val; catalogGrid(); break;
      case 'genre': state.genre = t.dataset.val; genreGrid(); break;
      case 'key': typeChar(t.dataset.ch); break;
      case 'space': if (state.query && !/ $/.test(state.query)) typeChar(' '); break;
      case 'del': state.query = state.query.slice(0, -1); searchResults(); break;
      case 'clear': state.query = ''; searchResults(); break;
      case 'details': openDetails(t.dataset.kind, t.dataset.id); break;
      case 'close-modal': closeModal(); break;
      case 'back':
        e.preventDefault();
        if (state.navCount > 1) history.back(); else location.hash = t.getAttribute('href');
        break;
      case 'control': {
        var f = $('#player-frame');
        if (f) { f.focus(); try { f.contentWindow.focus(); } catch (err) {} }
        var bar = $('#player-bar');
        if (bar) { clearTimeout(state.barTimer); bar.classList.add('hidden'); state.barHidden = true; }
        toast('Usa los controles del video · Pulsa Atrás para volver');
        break;
      }
    }
  });

  /* Control con puntero (Magic Remote de LG, air mouse): pasar el cursor da foco. */
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest ? e.target.closest('.focusable') : null;
    if (!el || el === document.activeElement || !isVisible(el)) return;
    if (state.modal && !state.modal.contains(el)) return;
    state.byMouse = true; el.focus(); state.byMouse = false;
  });

  /* Foco: recordar posición, mover scroll, actualizar billboard */
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('focusable')) return;
    if (screen.contains(el) && el.dataset.fk) {
      state.lastFk = el.dataset.fk;
      state.focusMem[parseRoute().hash] = el.dataset.fk;
    }
    if (!state.byMouse) ensureVisible(el);

    var home = $('#home');
    if (home) {
      var row = el.closest('[data-align]');
      home.classList.toggle('is-scrolled', !!row && Number(row.dataset.align) > 0);
      var h = el.dataset.hero;
      if (h) {
        clearTimeout(state.heroTimer);
        state.heroTimer = setTimeout(function () {
          var i = h.indexOf(':');
          setHero(h.slice(0, i), h.slice(i + 1));
        }, 170);
      }
    }
  });

  /* ----------------------------------------------------------------- toast */
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, ms || 3600);
  }

  /* ================================================================ ARRANQUE */
  buildSidebar();
  if (!location.hash) history.replaceState(null, '', '#/home');

  window.addEventListener('hashchange', function () { state.navCount++; render(); });

  // Datos: igual que la web, llegan de Firestore de forma asíncrona.
  onLibraryReady(function () { state.ready = true; render(); });
  onLibraryChange(function () { if (state.ready && state.live) render(true); });

  render();
})();
