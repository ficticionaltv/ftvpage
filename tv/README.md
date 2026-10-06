# FicticionalTV · versión TV

Carpeta `tv/` que se agrega junto a tu sitio actual. **No modifica ningún archivo existente**:
usa los mismos `js/firebase-config.js`, `js/data.js` y `js/store.js`, así que todo lo que
cargues desde el panel de administración aparece aquí solo (y en tiempo real).

## Cómo probarla
Sube la carpeta `tv/` a la raíz del proyecto (junto a `index.html`) y abre `/tv/index.html`.
En el computador funciona con el teclado: flechas, Enter (= OK) y Esc / Backspace (= Atrás).
Para simular una TV, pon el navegador a pantalla completa (F11) — se reescala sola a cualquier
resolución (720p, 1080p, 4K).

## Pantallas
| Pantalla | Qué hace |
|---|---|
| Inicio | Billboard que cambia según la tarjeta enfocada + filas: Continuar viendo, Destacados, Top 10, Próximamente, Mejor calificados, Extras |
| Buscar | Teclado en pantalla A–Z / 0–9 con resultados en vivo (también acepta teclado físico) |
| Catálogo | Rejilla con orden: recientes, populares, A–Z |
| Categorías | Chips de género (los mismos de la web) + rejilla |
| Recomendaciones | Ordenadas por calificación |
| Extras | Rejilla de extras → ficha con filas Video / Audio |
| Ficha | Botón inteligente (Ver / Continuar / Volver a ver), tráiler, detalles, fila de episodios con "visto" |
| Reproductor | Pantalla completa con barra que se oculta sola: Volver, Anterior, Siguiente, Controlar video |

## Control remoto
- **Flechas**: navegación espacial (se mueve al elemento más cercano en esa dirección).
- **OK / Enter**: seleccionar.
- **Atrás**: mapeado para teclado, Android TV, Samsung Tizen (10009) y LG webOS (461).
  Dentro de una ficha o del reproductor vuelve a la pantalla anterior; en una pantalla principal
  salta al menú lateral; en el menú de Inicio sale de la app.
- **Puntero** (Magic Remote de LG, air mouse): pasar el cursor también da foco.

## Reproductor: cómo funciona con tus enlaces
Los videos son `<iframe>` de terceros (YouTube, Dailymotion, etc.), y un iframe **captura el teclado**
cuando tiene el foco. Por eso el flujo es:
1. Se abre el episodio con la barra de controles arriba (Volver / Anterior / Siguiente).
2. Pulsa **OK en "Controlar video"** para pasarle el mando al reproductor (play, pausa, adelantar…).
3. Pulsa **Atrás** para volver a la ficha.

Los videos de YouTube/Dailymotion/Vimeo se abren con `autoplay=1`. Que arranquen solos depende
de la política de cada TV; si no, basta un OK sobre el reproductor.

## Redirección automática (opcional)
`redirect.js` detecta navegadores de smart TV y manda a `/tv/`. Inclúyelo en el `<head>` de
`index.html` si quieres ese comportamiento (`?tv=1` fuerza la versión TV, `?tv=0` la desactiva).

## Compatibilidad y rendimiento
Pensada para Chromium 60+ (Samsung 2018+, LG webOS 5+, Android TV, Google TV, Fire TV).
Sin blur ni sombras animadas: solo `transform` y `opacity`, que las TV aceleran bien.
Las TV más viejas (webOS 3/4, Tizen 4 o anterior) no soportan el JS de la web actual tampoco
(`store.js` ya usa sintaxis moderna), así que el requisito es el mismo.

## Lo que no incluye (a propósito)
- Panel de administración (se sigue usando el de la web).
- Empaquetado como app nativa (Tizen/webOS/APK): esta carpeta es la interfaz web; se puede
  envolver después en un WebView/TWA sin cambiar nada.
