# Radio Chiripa — cómo funciona la web

 Radio Chiripa es la web del festival **Chiripa 2026** (8 de noviembre de 2026, Shekinah Beach Club, Mazatlán). Tiene dos caras en un solo proyecto Next.js 16:

- **La radio pública** (`/`): una radio en vivo que transmite la biblioteca de música propia de la casa, en bucle, sincronizada contra el reloj del mundo. Todos los oyentes escuchan la misma canción en el mismo minuto, como una radio de verdad.
- **El gestor** (`/gestor`): el panel privado donde el dueño sube canciones, arma álbumes, pega letras y administra cuentas. Se abre con un PIN maestro o con cuentas propias (dueño/colaborador).

Todo el estado vive en archivos JSON dentro de `media/` — no hay base de datos externa: el proyecto se respalda copiando una carpeta.

---

## 1. Las tres piezas

```
┌─────────────────────┐        ┌──────────────────────┐
│  Radio pública (/)  │        │  Gestor (/gestor)    │
│  Reproductor + hojas│        │  Biblioteca, álbumes,│
│  Compartir, letras  │        │  letras, cuentas     │
└─────────┬───────────┘        └──────────┬───────────┘
          │  /api/radio/* (público)       │ /api/biblioteca/* (privado)
          ▼                               ▼
┌──────────────────────────────────────────────────────┐
│  src/lib — la lógica de la casa                       │
│  señal (reloj) · biblioteca · letras · álbumes ·      │
│  cuentas · autenticación                              │
└──────────────────────┬───────────────────────────────┘
                       ▼
            media/  (JSON + música + imágenes)
```

- La **señal** es la biblioteca en bucle: qué canción toca "ahora" sale de una cuenta matemática contra el reloj, no de un azar por visitante.
- El **gestor** escribe en `media/`; la radio lee de ahí. Un cambio en el panel se refleja en la radio al instante (la memoria de la señal se invalida con cada cambio).
- **Nada se inventa**: sin datos hay guiones ("—"), avisos honestos ("esperando la letra") y estados vacíos explicados. Nunca un número o letra falsa.

---

## 2. Cómo funciona una visita a la radio

### El reloj de la señal

1. `senal.ts` define `ORIGEN_SENAL = Date.UTC(2026, 0, 1)` — el origen histórico del bucle (1 de enero de 2026, UTC). Fijo a propósito: si dependiera de la hora de arranque del servidor, la señal cambiaría con cada reinicio.
2. `programacion.ts` tiene `pistaAlAire(pistas, origen)`: suma la duración de todas las pistas y calcula `(ahora − origen) % duraciónTotal`. El resultado dice qué pista toca y en qué segundo va. Es la misma idea de una estación real: cada minuto del mundo le toca una única canción.
3. `senal-extendida.ts` arma la lista de pistas desde la biblioteca (solo canciones **activas**, barajadas con una semilla que mezcla los ids y el día) y guarda un **ancla** en `media/aire.json`.

**¿Por qué el ancla?** Si el dueño sube o borra una canción, el total del bucle cambia y la cuenta módulo salta "a mitad de OTRA canción", cortando la escucha de todos. El ancla recuerda qué pista estaba al aire y con qué huella de señal; si la pista sigue existiendo y le quedan más de 2 segundos, el bucle se **rota** y el origen se recalcula para que esa canción continúe exactamente en su minuto. Si fue retirada, el bucle nuevo arranca de 0. La huella (`huellaPistas`: ids y duraciones) cambia solo si cambian las pistas — editar un título no re-ancla nada.

Además hay una **memo de 5 minutos** que se invalida si cambia la fecha de modificación del índice (`selloBiblioteca()`), así el aviso de "biblioteca cambiada" funciona aunque venga de otro proceso.

**El silencio de la señal** (`estado-radio.ts`): antes de armar la lista, `obtenerSenalExtendida` consulta `media/estado-radio.json`. Si hay un **silencio de emergencia** (botón de pánico del panel) o un **silencio nocturno programado** activo, la señal sale vacía — now-playing responde 503 **avisando el silencio y su motivo**, y el reproductor público corta el audio al instante. El ancla de `aire.json` **no se toca**: como la rotación es contra el reloj del mundo, al reactivar la señal la canción sigue exactamente donde iba. Las ventanas nocturnas se leen en **hora de Mazatlán** (`America/Mazatlan`) para que el silencio caiga en la noche correcta sin importar la zona del servidor. Las dos caras del descanso:

- **Nocturno**: la tarjeta saluda — *"Gracias por escuchar. Volvemos mañana a las 6:00 AM."* — con la hora de regreso calculada en el servidor (`mensajeNocturno`) a partir de la hora fin de la ventana; si el regreso cae el mismo día dice "hoy" en lugar de "mañana".
- **Emergencia**: la radio muestra **la cara por defecto de cuando no suena nada** ("Chiripa Radio · Encendiendo la señal…", portada del logo) y el aviso dice **"Señal no disponible en este momento; vuelve en cuanto se restablezca."** — sin airs de alarma.

### now-playing y listeners

- `GET /api/radio/now-playing` (público): devuelve la canción al aire (`id, titulo, artista, album, portada, duracionSeg, empezoISO, audioUrl`). Con la señal silenciada responde **503 con `{silenciada: true, motivo, reanudacionISO}`** — y en el nocturno además `titulo`, `detalle` y `mensaje` (el saludo "Gracias por escuchar…"); el reproductor corta el audio y muestra la cara que toque. Sin canciones activas responde 503 con `null` ("Encendiendo la señal…"). `empezoISO` es la clave: el reproductor no mide el tiempo con un temporizador, lo calcula contra el reloj.
- `GET /api/radio/cambios` (público): **el centinela**. Long-poll que vigila los sellos de modificación de `aire.json`, `estado-radio.json`, `biblioteca.json`, `letras.json` y `albumes.json`; con `?desde=<versión>` aguanta la respuesta hasta 20 s (preguntando cada segundo) y contesta apenas algo cambia, con `{version, cambios: {clave: mtime}}`. Es lo que hace que una letra pegada a mano, un pánico o un cambio de horario nocturno se vean en la radio pública **en un par de segundos**, sin recargar.
- `GET /api/radio/listeners` (público): contador de oyentes vivos. Cada cliente manda un latido cada 30 s con un id anónimo generado en el dispositivo (`localStorage`) y viaja en la cabecera `X-Cliente-Id`. El servidor guarda los latidos en un `Map` en memoria y purga los de más de 70 s. Nadie conectado → **503** (el guion "—" del reproductor), nunca un 0 falso.
- `GET /api/radio/oyentes/historial` (público): la audiencia de las últimas 24 h en pasos de 5 min (`oyentes.ts` deja una muestra por tramo en `media/oyentes.json`, se queda con el máximo del tramo y recorta a 24 h). Devuelve solo agregados — pico y promedio incluidos — para la minigráfica del panel; sin datos personales. Si nadie latió en más de 30 min, el tramo se pinta como cero: es la honestidad de una audiencia que ya no está.
- `GET /api/radio/senal` (público): estado del silencio (si está silenciada, por qué y cuándo reanuda). `POST /api/radio/senal` (tras la cerca del gestor): `panico` (minutos opcional), `reactivar` y `nocturno` (activo, desde, hasta).

### El reproductor del cliente (`src/lib/radio.ts`)

`useRadio()` es el corazón del cliente:

- Consulta now-playing y **se re-agenda solo**: la próxima pregunta se programa para el fin de la canción + 3 s (mínimo 3 s, máximo 5 min). También re-consulta al volver a la pestaña (`visibilitychange`). Todo el reprogramado pasa por un mismo `programar()` que cancela el latido vivo, así ninguna señal externa deja dos cadenas de consulta andando.
- **El centinela de cambios**: un long-poll a `/api/radio/cambios` corre en bucle paralelo. Cuando el dueño pega una letra, el índice de letras cambia y la caché de letras se invalida al momento (la hoja "Ver la letra" se refresca sin recargar); cuando toca tocar `estado-radio.json`, `aire.json`, `biblioteca.json` o `albumes.json`, se despierta la consulta de señal y la tarjeta se actualiza al instante. Si el long-poll falla, reintenta cada 5 s — los latidos normales siguen siendo la red de seguridad.
- **El silencio corta de verdad**: cuando now-playing trae `silenciada`, el audio de este oyente se pausa al momento (el anclaje de 25 s lo detecta mientras suena; la consulta, cada vuelta), el reproductor muestra la cara de descanso que corresponda y una **vela de 15 s** vigila la señal: en cuanto se reactiva, la escucha **vuelve sola** al minuto en vivo — salvo que el oyente hubiera pausado por su cuenta.
- **La radio no se adelanta ni se atrasa**: los controles del sistema (`mediaSession`: seekto, seekforward, seekbackward, previoustrack, nexttrack) quedan neutros para que la notificación y la pantalla de bloqueo no ofrezcan saltos, y un freno sobre el evento `seeking` del audio devuelve cualquier salto ajeno al minuto en vivo (los saltos internos — anclaje y cambio de pista — pasan por `moverA` y no se frenan).
- Carga el audio propio (`/api/biblioteca/audio/...`) y espera los metadatos máximo 2,5 s; si tarda, arranca desde el segundo 0 — mejor tarde que mudo.
- Un `setInterval` de **25 s** re-ancla la escucha: si la señal cambió de pista, carga la nueva en su minuto; si el desvío con el reloj pasa de **8 s** (un buffering normal no debe dar saltos), recoloca el `currentTime`. El margen `duración − 3 s` evita clavarse al final del archivo.
- **Pausar solo pausa aquí**: al reanudar salta al minuto en vivo, como en una radio de verdad. El audio es 100 % propio — suena completo, sin los adelantos de 30 segundos de Spotify.
- El primer `play` necesita un gesto del navegador: un `pointerdown { once: true }` enciende la radio en cuanto el oyente toca la pantalla.

`useOyentes()` consulta el contador y `useLetra(cancion)` trae la letra de la canción al aire (con caché en memoria y timeout de 6 s).

### Las letras al vuelo

`GET /api/radio/tracks/{id}/lyrics` (público) sirve la letra así:

1. Si hay letra guardada en disco (`media/letras.json`) → se sirve.
2. Si está marcada **instrumental** → `{ instrumental: true }` y la web muestra "Instrumental".
3. Si LRCLIB falló hace menos de **10 minutos** → 404 sin volver a llamar (backoff).
4. Si no: busca en LRCLIB en vivo y, si la encuentra, **la guarda para siempre** en disco.

---

## 3. Acceso y seguridad

### La puerta (`PuertaBiblioteca`)

La puerta vive en **`/acceso`** y el panel en **`/gestor`** — dos direcciones, un trabajo cada una. Sin llave, `/gestor` manda a `/acceso`, donde se identifica uno con el PIN del dueño o una cuenta (correo o usuario + contraseña); al entrar, el servidor entrega **dos llaves**:

- Una **cookie httpOnly** `chiripa-gestor` por 30 días: `Path=/; HttpOnly; SameSite=None; Secure; Partitioned`.
- Un **token Bearer** que el navegador guarda en `sessionStorage` y envía como `Authorization: Bearer …` en cada llamada del panel.

**¿Por qué dos?** El panel se abre dentro de iframes (la vista previa del proyecto vive embebida) y los navegadores bloquean las cookies de terceros: con solo cookie, el PIN "se aceptaba pero la biblioteca nunca abría". La cookie usa `Partitioned` (CHIPS) para llegar dentro del iframe, y el Bearer de `sessionStorage` — que sí funciona en iframes — la respalda. El servidor acepta cualquiera de las dos.

### Tokens firmados (`llave-servidor.ts`)

El token es `v1.<payload>.<firma>`, firmado con **HMAC-SHA-256** usando un secreto aleatorio de 32 bytes guardado en `media/llave.json` (si no existe, se genera; si el disco no es escribible, vive solo en memoria). El payload lleva `sub`, `rol` y `exp` (30 días).

- **Por qué no un hash fijo del PIN:** la primera versión usaba `SHA-256("chiripa-gestor:<PIN>")`. Era determinista: no vencía nunca y no se podía revocar sin cambiar el PIN. El token firmado expira y, al cambiar el PIN, **el secreto se rota y todas las sesiones mueren** — revocación instantánea, cuentas incluidas. El dueño que cambió el PIN recibe un token nuevo en la misma respuesta y no tiene que re-entrar.
- Comparaciones con `timingSafeEqual` (y un hash previo cuando las longitudes difieren) para no regalar información por tiempos de respuesta.
- **Rate limit del login:** 8 intentos por IP cada 5 minutos; al pasarse, 429 con `Retry-After: 120`. Un PIN corto cae por fuerza bruta en minutos — el límite lo evita. El fallo responde con un retraso fijo de 600 ms (igual que el acierto) para no dar pistas.

### El PIN

`pinEsCorrecto()` mira, en orden: (1) el PIN personalizado guardado como **scrypt + sal** en `media/config.json`, (2) la variable de entorno `GESTOR_PIN`, (3) en desarrollo el histórico `chiripa2026`, (4) en producción sin nada de lo anterior: rechazado. Nunca hay contraseña por defecto en producción. Cambiarlo exige el actual y uno nuevo de 6–64 caracteres.

### Las cuentas (`cuentas.ts`)

Auth 100 % propia, sin Supabase ni servicios externos — el panel funciona igual en cualquier servidor. Contraseñas con **scrypt + sal de 16 bytes por cuenta**, verificación con `timingSafeEqual`. Desactivar una cuenta cierra su sesión al instante (el token se re-verifica contra la lista de cuentas en cada uso). El servidor jamás devuelve `sal` ni `hash`: `publica()` los quita.

### El proxy (`src/proxy.ts`) — la cerca y los escudos

Next 16 ejecuta `proxy.ts` antes de las rutas (todo excepto los assets estáticos de `_next/`). El archivo original era solo la cerca; ahora también lleva los tres escudos anti-ataque, todos con perilla en `.env.local` que se lee **en cada petición** (cambiar el valor y reiniciar con `npm start` basta, sin reconstruir):

- **Candado de iframes** (`BLOQUEAR_IFRAMES=1`): añade en caliente `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` a cada respuesta — nadie incrusta la web en un marco ajeno. Apagado por defecto porque la vista previa del proyecto vive dentro de un iframe; `FRAME_ANCESTORS_EXTRA` autoriza dominios puntuales.
- **Rate limiting de capa 7** para TODO `/api/*`: ventana fija de 60 s contada en memoria, cubos separados de lecturas (`LIMITE_GET_MIN`, 240 por defecto) y mutaciones (`LIMITE_POST_MIN`, 30). Al pasarse: 429 con `Retry-After`. Un oyente real sondea ~40 pedidos/min entre centinela y oyentes; el límite deja 6× de margen.
- **Anti-hotlinking** (`BLOQUEAR_HOTLINK=1`): el audio y las portadas solo suenan con Referer propio — o vacío, como viajan apps, reproductores de escritorio y navegadores con privacidad estricta. El Referer ajeno recibe 403. Con `ORIGENES_PROPIOS` la lista blanca manda sobre el Host (modo estricto); sin ella se acepta el propio Host de la petición (modo cómodo).

Y la cerca de siempre, intacta:

- `/gestor` y `/acceso` **no redirigen desde la cerca**: la puerta vive en `/acceso` y el panel en `/gestor`, y es el propio navegador quien se muda — sin llave, `/gestor` verifica la sesión y deriva a `/acceso`; con llave, `/acceso` lleva directo al panel. La cerca se limita a entregar ambas con `X-Robots-Tag: noindex` y `Cache-Control: no-store`, sin datos privados en ninguna de las dos. Así ningún enlace viejo se rompe y no hay rebotes de servidor.
- Las rutas de archivos que un `<img>` o `<audio>` necesita (audio, portadas, fotos) son **públicas a propósito** — un tag de imagen no puede mandar la llave.
- `/api/biblioteca/**` sin cookie ni Bearer válido → **401 JSON** temprano (las APIs de la radio pública, `/api/radio/*`, ni pasan por esa cerca). Las rutas privadas **vuelven a verificar** adentro (`sesionValidaConToken`): defensa en profundidad por si la cerca no corre.
- Si el secreto no es legible (disco sin permisos), la cerca pasa de largo y las rutas deciden — nunca queda peor que sin cerca.
- El orden de los filtros es a propósito: primero el hotlinking (lo más barato), luego el rate limit y al final la verificación de llave — un diluvio sin sesión se corta antes de gastar una verificación HMAC.

### Cabeceras de seguridad (`next.config.ts` + `src/proxy.ts`)

`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (cámara, micrófono, geolocalización, pago y USB cerrados), `Cross-Origin-Opener-Policy: same-origin` (anti tabnabbing; los enlaces de compartir ya viajan con `rel="noopener"`) y **HSTS** con 2 años. La **CSP** se envía solo en producción (el modo dev de Next necesita `eval` e inline para el recargado en caliente) y permite imágenes del CDN de Spotify (las portadas de respaldo). No se envía `X-Frame-Options` ni `frame-ancestors` restrictivos por defecto porque la vista previa del proyecto vive dentro de un iframe — en el dominio de producción se encienden con `BLOQUEAR_IFRAMES=1` (ver el proxy, arriba). OJO: `next.config.ts` se evalúa al **construir**, así que toda cabecera que dependa de una perilla de entorno vive en el proxy, que sí lee `.env.local` en caliente.

---

## 4. Los datos — `media/`

| Archivo / carpeta | Qué es | Quién lo escribe |
|---|---|---|
| `biblioteca.json` | Índice de canciones (id, archivo, título, artista, álbum de la casa, portada, duración, huella, activa, fecha de subida) | subidas y ediciones |
| `biblioteca/` | Los archivos de audio (47 y contando) y las portadas extraídas del ID3 | la subida |
| `letras.json` | Letras guardadas para siempre (título/artista con los que se buscó, letra, marcas `sinLetraISO` e `instrumental`) | LRCLIB y el editor manual |
| `albumes.json` | Álbumes/sencillos/EP de la casa (nombre, tipo, carátula propia) | el panel de Álbumes |
| `cuentas.json` | Cuentas del panel (con sal+hash scrypt) | el panel de Cuentas |
| `cuentas/` | Fotos de las cuentas | la subida de foto |
| `llave.json` | El secreto de 32 bytes que firma las sesiones | se genera solo |
| `config.json` | El PIN personalizado (scrypt + sal) | Cambiar PIN |
| `aire.json` | El **ancla** de la señal (huella + origen + pistas con duración) | cada re-arme de señal |
| `oyentes.json` | Historial de audiencia: una muestra del conteo cada 5 min, 24 h de retención | el latido de los oyentes |
| `estado-radio.json` | Silencio de emergencia y silencio nocturno programado (ventanas en hora de Mazatlán) | el Control al aire del panel |

`media/` no se versiona en git: junto con la base de datos de la radio es lo único que hay que respaldar. El botón "Descargar biblioteca" de Configuración baja el JSON completo.

**Por qué JSON en disco y no una base de datos:** todo debe vivir dentro del proyecto, funcionar igual en local que en el servidor y poderse migrar copiando una carpeta. No hay consultas complejas que justifiquen más máquina.

**Cómo se escribe sin romperse:** cada módulo con escrituras (biblioteca, letras, álbumes, cuentas, señal) tiene una **cola de promesas** que serializa las escrituras — dos subidas simultáneas nunca se pisan el índice — y escribe en un archivo `.tmp` que luego se **renombra** (`renameSync`): o queda el archivo completo viejo o el completo nuevo, jamás un JSON a medio escribir.

---

## 5. La biblioteca: subida, portadas y letras

### Subida (`POST /api/biblioteca`)

- Multipart con campo `archivos` (varios a la vez, **máximo 12 por petición**) y `albumId` opcional para que lo subido caiga en esa carpeta.
- Formatos: `.mp3 .m4a .mp4 .flac .ogg .opus .wav`, hasta **60 MB** por archivo.
- Se leen las etiquetas ID3 con `music-metadata` (título, artista, duración) y la **portada embebida** se extrae a `media/biblioteca/`.
- **Anti-duplicados** (dos pruebas): la huella **SHA-256** del archivo (el mismo archivo re-subido) o título+artista iguales con duración **±3 s** (la misma canción re-codificada).
- Al terminar: la memoria de la señal se invalida (lo nuevo entra al aire ya) y la letra se busca en LRCLIB **en segundo plano**, sin bloquear la respuesta.

### Portadas de respaldo (Spotify)

Si la canción no trae portada embebida y hay credenciales `SPOTIFY_CLIENT_ID/SECRET` en `.env.local`, se busca en la API de Spotify (`client_credentials`, `market=MX`, `limit=5`):

- Spotify se usa **solo para datos** (título, artista, portada): nunca audio, nunca la señal. La radio suena la biblioteca propia, completa.
- La coincidencia exige el artista en las etiquetas y una duración dentro de **±8 s** — una carátula del disco equivocado sobra entre canciones homónimas; hay una segunda oportunidad con título+artista exactos hasta 75 s de diferencia (el mismo tema, master distinto).
- El botón "Buscar portada" del gestor (`PATCH {id, reintentarPortada:true}`) repite la búsqueda; al **editar título o artista** también se reintenta solo (por eso la canción previa se lee ANTES de editar — comparar después jamás detectaría el cambio).

### Letras (LRCLIB + el molde)

LRCLIB (lrclib.net) es la fuente: pública, gratuita y sin API key — la Web API de Spotify no reparte letras. La estrategia en `buscarLetra()`: `/api/get` directo por título (+ artista primario) y, si falla, `/api/search` eligiendo la coincidencia más parecida por nombre, artista y duración. Se prefiere la letra plana; de las sincronizadas se extrae el texto sin marcas de tiempo.

**El molde** (`letra-formato.ts`): la plantilla del gestor (`[Título]`, `[Coro]`, `[Verso 1]`…) es el **formato de entrega** — cómodo para escribir. Pero lo que se guarda, venga del pegado, de un `.txt`/`.lrc` subido o del propio LRCLIB, pasa por `normalizarLetra()`, que quita: marcas de tiempo `[00:14.32]`, metadatos de `.lrc` (`[ti:]`, `[ar:]`…), líneas de solo corchetes (secciones y el título), secciones escritas a mano (`Coro:`, `Verso 2`… con lista cerrada español/inglés para no comerse un verso real), repeticiones (`(x2)`, `bis`, y la pegada al final de un verso) y restos de la plantilla de ejemplo. Lo guardado queda **pelado — solo versos y estrofas** — e idempotente: pasarlo dos veces no cambia nada. El servidor repite el molde al guardar por si el navegador trae una versión vieja del editor.

**Instrumentales:** el interruptor "Sin letra (instrumental)" guarda `instrumental: true`; la web muestra "Instrumental" y LRCLIB deja de intentarlo (p. ej. Trampa para Hadas, banda de rock instrumental). Se puede desmarcar y la canción vuelve al mundo de las buscables.

**Sin letra a secas:** guardar el editor con la caja vacía y el interruptor apagado también es válido — borra la letra guardada y la canción queda sin letra **sin** marca de instrumental (el botón cambia a "Guardar sin letra"). Nota: al no quedar constancia de fallo, la siguiente pasada de "Buscar en LRCLIB" volverá a intentar estas canciones.

**La pasada masiva** (botón "Buscar letras"): recorre la biblioteca buscando solo lo que falta, con un presupuesto de **45 s** para no dejar la petición colgada (lo que no alcanza queda "pendiente" para la siguiente) y un descanso de **24 h** para las que LRCLIB no tiene, para no machacar el servicio.

---

## 6. Las imágenes para compartir

Dos generadores de imagen propios, en canvas 2D, que salen **idénticos en Chrome, Safari y Firefox**:

- **Historia de Instagram** (`HojaHistoria`): 1080×1920 con el mismo acomodo que las historias de Radio ATP: fondo con la portada al aire desenfocada y oscurecida, punto rojo "EN VIVO" arriba a la izquierda, el wordmark "Chiripa" en la fuente de piedra (caveman, a un tamaño contenido) con "RADIO CHIRIPA" debajo y su línea divisoria, la portada cuadrada (840×840) en tarjeta redondeada, título y artista a la izquierda, y "SINTONIZA" + dominio al pie.
- **Tarjeta de la letra** (`HojaTarjeta`): 1080×1350 — se eligen versos (máximo 200 caracteres), se autoajusta el tamaño desde 92 px; la cabecera lleva el wordmark "Chiripa" y, a la derecha, el **punto rojo en vivo + "RADIO CHIRIPA"** (31 px, legible a primera vista), con canción y "SINTONIZA LA RADIO" al pie.

Todo el dibujo pasa por `src/lib/lienzo.ts` porque el canvas de los navegadores no es uniforme: `ctx.filter` no existe en Safari < 18 (el desenfoque se hace **reduciendo y ampliando** la imagen, portátil en todos lados), `ctx.roundRect` no está en Safari < 16.4 (las esquinas se dibujan a mano con `arcTo`), y las fuentes se esperan con `document.fonts` antes de escribir. Las imágenes se cargan con `crossOrigin="anonymous"` para que el canvas quede "limpio" y el PNG se pueda guardar y compartir con `navigator.share`.

Las fuentes viven en `src/lib/fuentes.ts`: **Prehistoric Caveman** (la "piedra", local, donationware — licencia en `src/app/fonts/`, el TTF viene reescalado porque el original dibuja en una caja de 2.08 em) y **Baloo 2** (la "burbuja", Google Fonts, variable 400–800). Caveman no trae acentos ni `¡¿`: cae a Baloo sin que se note.

---

## 7. Mapa del proyecto

```
prueba-radio/
├─ package.json / bun.lock          dependencias y scripts
├─ next.config.ts                   cabeceras de seguridad, CSP, standalone
├─ Caddyfile                        proxy del entorno de pruebas (:81 → :3000)
├─ Caddyfile.produccion             plantilla endurecida para el dominio real
├─ tsconfig.json / eslint.config.mjs / postcss.config.mjs
├─ public/                          logo, cartel 2026, robots.txt
├─ media/                           LOS DATOS (ver sección 4)
└─ src/
   ├─ proxy.ts                      la cerca y los escudos: llaves, límites
   │                                por IP, anti-hotlinking y candado iframes
   ├─ app/
   │  ├─ layout.tsx                 metadata, fuentes, Toaster
   │  ├─ page.tsx                   LA RADIO PÚBLICA
   │  ├─ acceso/page.tsx            LA PUERTA (login) del panel
   │  ├─ gestor/page.tsx            EL PANEL
   │  ├─ globals.css                todo el estilo (4.5k líneas, por secciones)
   │  ├─ fonts/                     prehistoric-caveman.ttf + licencia
   │  └─ api/
   │     ├─ biblioteca/             route (CRUD canciones), albumes(+portada),
   │     │                          audio, config, cuentas(+foto), letras,
   │     │                          portada, sesion
   │     └─ radio/                  now-playing, listeners, cambios (centinela), tracks/[id]/lyrics
   ├─ components/
   │  ├─ chiripa/                   la radio: Encabezado, ReproductorRadio,
   │  │                             Hoja* (letra, tarjeta, cartel, sobre,
   │  │                             boletos, compartir, historia), Puerta
   │  ├─ gestor/                    el panel: Biblioteca, Albumes, Letras,
   │  │                             Cuentas, Configuracion, Resumen,
   │  │                             EditorLetra, api, tipos
   │  └─ ui/ + hooks/               toast (shadcn/Radix)
   └─ lib/                          la lógica (16 módulos, sección 8)
```

---

## 8. Los archivos, uno por uno

### `src/lib/senal.ts`

El más chico y el más importante: `ORIGEN_SENAL = Date.UTC(2026, 0, 1)`, el origen histórico del bucle. Separado en módulo propio porque lo usan `programacion.ts` y la señal extendida. *Por qué fijo:* para que la posición en la señal dependa solo del reloj, no del arranque del servidor.

### `src/lib/programacion.ts`

- `PistaSenal {id, uri, titulo, artista, album?, portada?, duracionMs, origen?, audioUrl?}` y `PistaAire {id, duracionMs}`: los tipos que comparten señal y biblioteca.
- `pistaAlAire(pistas, origen = ORIGEN_SENAL)`: `(Date.now() − origen) % total`, recorre acumulando duraciones y devuelve `{pista, transcurridoMs}` (o null si no hay pistas).
- `obtenerToken()`: token de **lectura** de Spotify (client credentials) con caché en memoria y margen de 60 s antes de expirar. Solo sirve a la búsqueda de portadas.

### `src/lib/senal-extendida.ts`

- `obtenerSenalExtendida(): {pistas, biblioteca, origen}` — memo de 5 min + sello del índice.
- El **ancla** en `media/aire.json`: `{origen, sello, pistas[{id, duracionMs}]}`. Misma huella → mismo origen; huella distinta → `pistaAlAire` contra las pistas viejas: si la canción al aire sigue existiendo y le quedan >2 s, el array se rota y `origen = ahora − transcurrido`; si fue retirada, origen nuevo. *Por qué:* que subir o borrar música no corte la radio de nadie.
- `invalidarSenalMemo()`: la llaman subida/edición/borrado/álbumes para que el aire se re-arme ya.

### `src/lib/biblioteca.ts`

El núcleo de las canciones propias.

- `CancionBiblioteca` (con `albumId`, `activa`, `huella`), `TAMANO_MAXIMO = 60 MB`, `TIPOS` (extensión → MIME), `nombreSeguro()` (basename + regex plana — los endpoints de archivos nunca sirven una ruta arbitraria).
- `agregarArchivo()`: valida formato y tamaño, calcula la huella SHA-256, lee ID3 con `music-metadata`, extrae la portada embebida a `/api/biblioteca/portada/<id>.<ext>`, **rechaza duplicados** (huella idéntica o título+artista ±3 s) y si no hay portada, busca el respaldo de Spotify. Rellena huellas de canciones viejas al vuelo (cache en memoria).
- `editarCancion()`: título/artista/álbum (≤120); `albumId: null` desengancha; `activa` saca de rotación sin borrar.
- `reintentarPortada()`: solo si no tiene portada propia y hay duración.
- `pistasSenalBiblioteca()`: activas con duración >0, barajadas con `mulberry32` sembrado con los ids (mezcla estable por biblioteca) — ids `biblio:<id>`, audio por `/api/biblioteca/audio/<archivo>`.
- `cola`/`enCola()`: la cola de escritura del índice; `escribirIndice()` con `.tmp` + rename.

### `src/lib/letras.ts`

Todo LRCLIB, descrito en la sección 5. Piezas: `letraGuardada`, `esInstrumental`, `registrarLetra`, `registrarInstrumental` (conserva la letra previa por si se desmarca), `registrarSinLetra` (constancia del fallo con timestamp), `borrarLetra`, `sinLetraReciente` (ventana de 10 min para la ruta en vivo), `buscarLetra` (get → search → search libre, con `parecido()` por intersección de palabras normalizadas y la duración como desempate), `actualizarLetra(id, forzar)` y `actualizarLetrasFaltantes(presupuestoMs=45s)` con su `ResumenLetras`. Timeout de fetch: 8 s. La entrada guarda el título/artista con los que se buscó: al corregirlos con el lápiz, se re-busca.

### `src/lib/letra-formato.ts`

El molde, descrito en la sección 5: `sinMarcasDeTiempo()` (quita todas las marcas iniciales — los `.lrc` a veces traen dos para los repetidos), `normalizarLetra()` (idempotente) y `parecePlantillaSinRellenar()` (≥2 de 4 huellas de la plantilla vacía, evaluado sobre el texto **crudo** porque el molde borra esos restos del texto limpio).

### `src/lib/albumes.ts`

Álbumes lógicos: `TipoAlbum = "album" | "single" | "ep"` (+ `TIPOS_ALBUM` con sus nombres), `Album {id, nombre, tipo?, creadoISO, portada?}`. `crearAlbum` (nombre ≤120, único sin mayúsculas, id `al-<ts36>-<hex>`), `renombrarAlbum`, `guardarPortadaAlbum` (JPG/PNG/WebP hasta 8 MB, borra la anterior), `quitarPortadaAlbum`, `rutaPortadaAlbum` (regex anti path-traversal), `eliminarAlbum` (recoge la carátula; las canciones las desengancha la API antes). *Por qué etiqueta y no carpeta:* el nombre del álbum vive una sola vez aquí; renombrarlo cambia la línea "álbum" de todas sus canciones en la radio sin tocar archivos, y borrarlo jamás borra música. Sin carátula propia se presta la de la primera canción que tenga.

### `src/lib/cuentas.ts`

Cuentas del panel con auth propia (sección 3): `Rol`, `CuentaPublica` (sin sal/hash), `entrarCuenta(identidad, contrasena)` (correo **o** usuario, sin mayúsculas; actualiza `ultimaEntradaISO`), `crearCuenta`/`editarCuenta` (nombre ≤80, correo con regex simple, usuario `/^[a-z0-9._-]{3,40}$/` opcional, contraseña ≥6, únicos), `eliminarCuenta` (borra su foto), `guardarFotoCuenta` (≤5 MB), `firmarSesionCuenta`/`sesionCuenta` (delega en `llave-servidor`; exige cuenta existente y **activa**), `recuperarCuentas(entrantes)` (respaldos: agrega solo las que no existen por id o credencial — jamás toca las actuales, las sesiones vivas siguen vivas).

### `src/lib/respaldo.ts`

El respaldo completo en un ZIP (fflate, sin dependencias nativas). **`construirRespaldo()`** arma el archivo con todo lo que no es audio: `biblioteca.json` (el índice tal cual), `letras.json`, `albumes.json`, `cuentas.json`, `estado-radio.json`, `oyentes.json`, `config.json` si existe, `portadas/`, `caratulas-albumes/`, `fotos-cuentas/`, un `LEEME.txt` con instrucciones, `respaldo.json` (manifiesto con formato y fecha) y **`letras-txt/`**: una letra por archivo de texto legible (`Artista — Título.txt`), para leerlas o copiarlas a mano. El audio no va — respaldarlo es copiar `media/biblioteca/`.

**`aplicarRespaldo()`** restaura con empareje por huella digital (SHA-256 del archivo):

1. Extrae las imágenes del ZIP a sus carpetas (nombres validados, ≤8 MB).
2. Fusiona los álbumes (los del respaldo mandan; la carátula solo si el archivo existe).
3. Devuelve al índice las canciones del respaldo cuyo audio sigue en disco (el caso "perdí `biblioteca.json` pero no la música"); las que no tienen audio se omiten y se reportan.
4. **Re-engancha metadatos**: una canción re-subida desde cero (id nuevo, huella igual) recupera título, artista, álbum, álbum de la casa, portada y estado activa/pausada; la coincidencia es por huella y, de falta esta, por título+artista+duración (±3 s).
5. **Re-engancha letras** (las pegadas a mano incluidas): el id del respaldo se re-encuentra por id directo → huella → nombre+duración; si la letra actual ya es idéntica cuenta como «ya estaba» y no se toca.
6. Recupera cuentas perdidas, restaura el silencio nocturno (la emergencia en curso jamás se toca) y fusiona el historial de oyentes por marca de tiempo.

`leerRespaldo()` acepta el ZIP, el JSON de la biblioteca (`{canciones}` o arreglo pelón) y un objeto completo `{biblioteca, letras, …}`. Al importar no se tocan el PIN maestro ni las sesiones abiertas; el índice se escribe al final y la señal se invalida para recomponerse sin cortar la canción en curso.

### `src/lib/llave-servidor.ts`

Las piezas criptográficas (sección 3): `VIDA_SESION_MS` (30 días), `SUB_DUENO`, `secretoSesiones()` (lee/genera `media/llave.json`, cache en memoria), `rotarSecretoSesiones()`, `firmarTokenSesion`/`verificarTokenSesion` (`v1.<payload>.<firma>`), `pinPersonalizado`/`pinEsCorrecto`/`cambiarPin` (scrypt+sal, 6–64, rota el secreto), `ipDe(req)` (x-forwarded-for → x-real-ip → "local") y el rate limit de login (`VENTANA_MS = 5 min`, `MAX_INTENTOS = 8`).

### `src/lib/gestor-auth.ts`

La válvula del panel: `cookieSesion(token)` (la cookie CHIPS de 30 días), `cookieBorrada()`, `sesionValidaConToken(req)` (cookie o Bearer, verificando firma y vigencia contra las cuentas), `tokenDeSesion()`, `quienEntra(req)` (el dueño del PIN primero, luego la primera cuenta válida), `esDueno(req)`. Toda ruta privada del panel pasa por aquí.

### `src/lib/llave-cliente.ts`

El lado del navegador de la segunda llave: `guardarToken`/`leerToken`/`borrarToken` sobre `sessionStorage` (con try/catch: sin storage queda la cookie) y `cabeceraLlave()` que arma `Authorization: Bearer …`. En SSR devuelve vacío — inofensivo.

### `src/lib/radio.ts`

Los hooks del cliente (sección 2): `RADIO_CONFIG` (`apiBase`, `oyentesCadaMs: 30s`, `letraFueraMs: 6s`…), `Cancion`, `TEXTOS` (todos los mensajes de estado, incluidos los honestos), `formatearTiempo`/`formatearRestante`, `apiConectada()`, `useRadio()`, `useOyentes()`, `useLetra()`, y `idCliente()` (UUID persistente en `localStorage` para el latido de oyentes). Acepta campos legacy de la señal original (`duration_sec`, `started_at`).

### `src/lib/festival.ts`

La configuración editorial del festival, toda `as const`: `FESTIVAL` (título "Chiripa 2026", fase, fechas "8 NOV 2026", `fechaISO`, lugar "Shekinah Beach Club", dirección, Instagram `@chiiiripa`, TikTok, `passlineUrl` de la venta), `CARTEL` (2 titulares + 4 artistas), `CARTEL_IMAGEN`, `SOBRE` (párrafos) y `sitioActual()` (la URL propia o `window.location.origin`). Un cambio aquí actualiza tarjeta, hojas, historia y mensaje para compartir. `sitioUrl` vacía a propósito: se comparte la URL de la propia página.

### `src/lib/fuentes.ts`

`baloo` (Google Fonts, variable `--font-baloo`) y `caveman` (local, `--font-caveman`), con `display: "swap"` y la nota del reescalado del TTF. Centralizado para que layout y canvas usen exactamente la misma familia.

### `src/lib/lienzo.ts`

Las utilidades de canvas portables (sección 6): `cargarImagen` (con `crossOrigin` y tope de 5 s), `esperarFuentes` (8 intentos × 200 ms, nunca rompe), `dibujarDifuminada` (reducir y ampliar, `imageSmoothingQuality: "high"`), `rutaRedondeada` (`arcTo` a mano) y `textoAjustado` (encoge hasta 12 px mínimo).

### `src/lib/utils.ts`

El helper `cn` de shadcn (clsx + tailwind-merge), usado por el toast.

### `src/proxy.ts`

La cerca y los escudos (sección 3). La decisión de diseño más visible: `/gestor` siempre entrega la página — la seguridad está en los datos que salen (ninguno sin llave), no en esconder la URL. Los escudos (rate limit, hotlinking, candado de iframes) viven aquí y no en `next.config.ts` porque este archivo corre en cada petición y lee las perillas de `.env.local` en caliente.

### `src/app/layout.tsx`

Metadata del sitio (título, descripción con fecha y sede, OG/Twitter con `metadataBase`, icono), `<html lang="es">`, las variables de las dos fuentes en el `<body>`, `viewportFit: "cover"` para los notch, `themeColor` #241510 y el `<Toaster />` global.

### `src/app/page.tsx` — la radio

La página pública. Todo el estado de la señal vive aquí (`useRadio`, `useOyentes`, `useLetra`) y baja por props: reproductor, letra y compartir ven siempre la misma canción. Las 7 hojas (letra, tarjeta, cartel, sobre, boletos, compartir, historia) se cargan con `next/dynamic` — la radio abre con el mínimo JS; el generador de canvas solo baja si se usa. `FondoDinamico` apila hasta 3 portadas con crossfade (precarga cada una antes de fundir). El cierre de hojas está protegido contra saltos (cerrar cartel → abrir boletos no debe cerrar boletos).

### `src/app/acceso/page.tsx`

Alias histórico: redirige a `/gestor` (`window.location.replace`) mostrando la espera. El proxy también redirige; esto es el respaldo del cliente.

### `src/app/gestor/page.tsx` — el panel

Revisa la sesión (`GET /api/biblioteca/sesion`): sin llave muestra la puerta, con llave el panel. Carga todo en paralelo (biblioteca, álbumes, now-playing, listeners y —solo dueño— cuentas) y refresca el aire cada 30 s si la pestaña es visible. Cualquier 401 devuelve a la puerta **en la misma página**. El lateral colapsable persiste en localStorage, al igual que el tema (negro/blanco, que se aplica en `documentElement` antes de pintar); la sección "cuentas" ni aparece si no eres dueño. Las 5 secciones pesadas son `dynamic()`. En móvil la barra lateral es un riel horizontal: logo, iconos y sesión — nada se sale de la pantalla.

### Las rutas de `src/app/api`

| Ruta | Métodos | Acceso | Qué hace |
|---|---|---|---|
| `/api/biblioteca` | GET POST PATCH DELETE | privada | CRUD de canciones; POST sube hasta 12 archivos (60 MB c/u), valida duplicados, extrae portada y letra; PATCH edita / reintenta portada / pausa; DELETE borra audio+portada |
| `/api/biblioteca/albumes` | GET POST PATCH DELETE | privada | álbumes + resumen por artista + sueltas; borrar no borra canciones |
| `/api/biblioteca/albumes/portada` | POST DELETE | privada | carátula de álbum (JPG/PNG/WebP ≤8 MB) |
| `/api/biblioteca/albumes/portada/[archivo]` | GET | pública | sirve la carátula (nombre validado, cache 1 día) |
| `/api/biblioteca/audio/[archivo]` | GET | pública | stream del audio con **Range** (206/416), MIME por extensión, cache 1 h; el archivo debe existir en el índice |
| `/api/biblioteca/config` | GET PATCH | privada (PATCH: dueño) | estado del PIN; cambiarlo rota el secreto y entrega token nuevo |
| `/api/biblioteca/cuentas` | GET POST PATCH DELETE | privada + dueño | CRUD de cuentas, nunca expone hash |
| `/api/biblioteca/cuentas/foto` | POST | privada | foto de cuenta (≤5 MB), devuelve la ruta pública |
| `/api/biblioteca/cuenta-foto/[archivo]` | GET | pública | sirve la foto (cache 7 días) |
| `/api/biblioteca/letras` | GET POST PUT | privada | estado, pasada masiva LRCLIB, letra manual (el servidor repite el molde; en blanco libera la canción; `instrumental` la marca) |
| `/api/biblioteca/portada/[archivo]` | GET | pública | portada de canción (cache 1 día) |
| `/api/biblioteca/respaldo` | GET POST | privada + dueño | GET arma el ZIP completo (índice, letras, álbumes, cuentas, silencio, audiencia, imágenes, letras-txt); POST importa ZIP o JSON y devuelve el informe de qué se restauró |
| `/api/biblioteca/sesion` | GET POST DELETE | **pública** (es el candado) | quién soy; entrar con PIN o cuenta (rate limit 8/5 min, 429 + Retry-After); salir |
| `/api/radio/now-playing` | GET | pública | la canción al aire con `empezoISO`; sin señal 503 `null` |
| `/api/radio/cambios` | GET | pública | el centinela: long-poll de sellos de media/ (20 s de aguante) que empuja letras y silencios al instante |
| `/api/radio/listeners` | GET | pública | oyentes vivos por latidos (70 s de vida); nadie → 503 |
| `/api/radio/tracks/[id]/lyrics` | GET | pública | letra guardada → instrumental → backoff 10 min → LRCLIB en vivo (y lo guarda para siempre) |

Las privadas comparten el 401 uniforme `{ conectado: false, error }` y `Cache-Control: no-store`; las de archivos validan el nombre con regex (solo la carpeta suya, jamás una ruta arbitraria).

### `src/components/chiripa/` — la radio

- **Encabezado**: wordmark "Chiripa" (la C grande), "Festival De Música y Arte", píldora "En vivo" con punto que late, sociales. El ícono de TikTok es un SVG propio porque lucide-react no trae marcas de terceros.
- **ReproductorRadio**: presentacional puro — portada, canción, chip de espectadores (guion si `null`), progreso, un solo botón play⇄pause, y accesos a letra/cartel/sobre.
- **Hoja**: el `<dialog>` nativo reutilizado por todas las hojas (foco atrapado y Esc gratis; centrada flotante en escritorio, sube desde abajo en móvil). Props: `id, abierto, alCerrar, titulo, subtitulo?, children, pie?, etiqueta?, portada?`.
- **HojaLetra**: la letra estilo Apple Music; aplica el molde como red de seguridad; instrumental → "Instrumental"; sin letra → mensaje honesto.
- **HojaTarjeta**: el "lyrics card" — elegir versos (≤200 caracteres, los que no caben se descansan), ver la imagen, guardar/compartir el PNG.
- **HojaCartel**: el póster 2026 — el cartel original del festival (arte étnico sobre turquesa). `cartel-2026-negro.jpg` guarda la alternativa tipográfica en negro (generador en `scripts/banner/`) por si se quiere volver a ella; los artistas van en la imagen, solo se listan en el `alt`.
- **HojaBoletos**: Passline o DM — los dos caminos de compra, sin precios inventados.
- **HojaSobre**: la historia editorial de Chiripa; la fecha protagonista y el resto como créditos de programa.
- **HojaCompartir**: mensaje listo (con el "ahora suena" que manda LA SEÑAL, aunque el reproductor local esté en pausa), X, copiar, share nativo y acceso a la historia.
- **HojaHistoria**: el generador 1080×1920 (sección 6).
- **PuertaBiblioteca / PuertaEspera**: la puerta del panel con sus dos modos (PIN / cuenta), botones-ojo, sacudida en error y el check de 500 ms al entrar.

### `src/components/gestor/` — el panel

- **Resumen**: la portada del panel — señal al aire (o "señal apagada"), oyentes, métricas (canciones en rotación/pausa, álbumes, artistas, letras, almacén), barras por álbum y últimas 5 subidas. Todo derivado de la API.
- **Biblioteca**: subida con progreso real por archivo (XMLHttpRequest para `upload.onprogress`), filtros (texto sin acentos, álbum, artista), páginas de 10, previsualización de audio, edición en la fila (título/artista/álbum — el álbum de la casa manda y sincroniza la etiqueta), reintento de portada, pausa/activación, borrado con confirmación inline y el editor de letra. Marcas "Con letra / Sin letra / Instrumental / Sin portada". El filtro por álbum es una fila de chips **desplazable lateralmente** (sin barra visible): con muchas carpetas no se amontona; desde 7 carpetas aparece el botón fijo "Ver todas (n)" que expande la fila en varias líneas y "Menos" la regresa a una. Las opciones de los `<select>` del panel llevan fondo y texto explícitos: se leen bien en la versión oscura y en la clara (el menú nativo no siempre hereda el tema).
- **Albumes**: carpetas de la casa — crear/renombrar/cambiar tipo, carátula propia, subir directo a la carpeta, crear álbum desde un artista (engancha sus sueltas), y la vista viva **Por artista**.
- **Letras**: el pulso — cobertura, pasada masiva y el editor por canción.
- **Cuentas** (solo dueño): CRUD con foto, rol y activación; desactivar cierra la sesión al instante.
- **Configuracion**: cuenta y acceso (cambiar PIN rota el secreto), apariencia (lateral y modo denso, persistidos), datos — descargar la biblioteca en JSON, el **respaldo completo en ZIP** (solo dueño) e **importar respaldo** (ZIP o JSON, con informe de qué volvió y botón de recargar) — y acerca de.
- **EditorLetra**: los cuatro caminos (pegar con el molde al vuelo, subir `.txt`/`.lrc` entendiendo la plantilla, marcar instrumental, guardar sin letra sin marcarla) y la plantilla descargable.
- **api.ts**: `pedirGestor()` — el fetch del panel con la llave siempre puesta; 401 → `null` y cada panel devuelve a la puerta.
- **tipos.ts**: los tipos tal como los sirve la API + formatos amables (`formatoDuracion`, `formatoTamano`, `iniciales`, `haceCuanto` con `es-MX`).

### `src/components/ui/` y `src/hooks/`

El toast de shadcn/Radix (`toast.tsx`, `toaster.tsx`, `use-toast.ts`), sin personalizar: es el estándar que consumen compartir y copiar enlace. `TOAST_LIMIT = 1` (un toast a la vez).

### `src/app/globals.css`

Un solo archivo, ~4.500 líneas, organizado por divisores de sección. Tres idiomas visuales:

1. **La radio** (clases `chiripa-*`): cuero #241510 y crema #f7ead2 — el turquesa se retiró por completo de la interfaz —, tarjeta de vidrio, botones circulares de 44 px táctiles, `--display` = Caveman + Baloo. Los **botones del reproductor son negros** (`--boton: #101010`) con un filete blanco (`--boton-borde`) y el contorno de foco blanco (`--foco: #ffffff`). Responsive completo: hoja flotante en escritorio, tarjeta a dos columnas en móvil horizontal, vista única en pantallas ≤360 px, `prefers-reduced-motion`.
2. **La puerta** (`puerta-*`): reutiliza el idioma de la radio (mismo fondo, tarjeta de vidrio gemela).
3. **El panel** (`panel-*`): **negro neutro y serio, con tipografía Inter** — un idioma propio para quien gestiona la radio, sin los colores de la marca: superficies #09090b–#16161a, textos #f4f4f5, bordes hairline blancos al 9–18 %, un solo acento (el propio texto claro) y verde/ámbar/rojo solo para estados. **Sin cajas**: las secciones se separan con hairlines como las filas de canciones; solo los controles (buscador, segmentos, editor) llevan superficie. La **versión blanca** (`html.panel-claro`) invierte la paleta y se elige en Configuración → Apariencia (localStorage `chiripa-panel-tema`). Lista compacta opcional (`panel-denso`), lateral en riel de iconos, paginación, badges; botones que **doblan línea** en vez de desbordarse.

### `public/`

`chiripa-logo.jpg` (logo y fallback de portadas), `cartel-2026.jpg` (el póster oficial), `logo.svg`, `robots.txt` (permite buscadores y scrapers de tarjetas sociales).

---

## 9. Configuración y arranque

```bash
npm install          # dependencias (o bun install, si usas Bun)
npm run dev          # desarrollo en http://localhost:3000
npm run build        # build de producción (output standalone)
npm start            # sirve el build standalone con Node
```

Los tres comandos funcionan igual en Windows, macOS y Linux: los scripts de `package.json` no usan comandos de shell (`cp`, `tee`). Tras el build, `scripts/copiar-standalone.mjs` copia los assets y **enlaza `media/`** dentro del standalone (el `server.js` de Next cambia su carpeta de trabajo al arrancar), y `scripts/arrancar.mjs` **carga `.env.local`** — el standalone solo no lo lee — antes de arrancar con Node. Para servir en otro puerto: `PORT=3100 npm start` (en Windows PowerShell: `$env:PORT=3100; npm start`).

- **`.env.local`**: `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` — solo para el respaldo de portadas. Sin ellas todo funciona; las canciones sin portada embebida quedan con el logo. `GESTOR_PIN` define el PIN maestro del panel. Además, comentadas, las **perillas de los escudos** del proxy: `BLOQUEAR_IFRAMES`, `BLOQUEAR_HOTLINK`, `ORIGENES_PROPIOS`, `FRAME_ANCESTORS_EXTRA`, `LIMITE_GET_MIN`, `LIMITE_POST_MIN` — la guía `guia-seguridad-rendimiento-chiripa.pdf` (entregada aparte) explica cada una.
- **`Caddyfile`**: el proxy del entorno de pruebas (puerto 81 → 3000, con el truco de `XTransformPort` para la vista previa). **`Caddyfile.produccion`** es la plantilla endurecida para el dominio real: TLS 1.2/1.3, compresión zstd/gzip, cabeceras al borde, anti-hotlinking del audio antes de llegar a Node, tope de 200 MB para subidas y redirección HTTP → HTTPS explícita. Reemplaza `chiripa.radio` por el dominio real y arranca con `caddy run --config Caddyfile.produccion`.
- **`next.config.ts`**: cabeceras de seguridad + CSP (solo producción), `output: "standalone"` (un `server.js` autosuficiente), `turbopack.root` fijo a la raíz del proyecto, `poweredByHeader: false`, `reactStrictMode: false` (el doble montaje de efectos molesta a un cliente de radio con side effects reales), `typescript.ignoreBuildErrors: true` (el typecheck se corre aparte; hoy pasa limpio).
- **`package.json`**: 8 dependencias de runtime — `next react react-dom music-metadata lucide-react @radix-ui/react-toast class-variance-authority clsx tailwind-merge` — y Tailwind 4 por PostCSS. Nada más: cada librería que entró tenía que justificarse.
- **Versiones**: la del panel es `1.3.0` (`VERSION_PANEL` en la ruta de config).

---

## 10. Decisiones transversales (el por qué, en una página)

1. **Señal determinista contra el reloj**, no azar por visitante: `(ahora − origen) % duración`. Todos escuchan lo mismo; pausar y reanudar salta al minuto en vivo.
2. **Audio 100 % propio**: la radio suena la biblioteca completa, sin los adelantos de 30 s de Spotify ni embeds ajenos. Spotify solo presta **datos** (portada de respaldo); LRCLIB presta letras.
3. **JSON en disco con cola de escritura y rename atómico**: sin base de datos que mantener, migrable copiando `media/`, imposible de dejar a medio escribir.
4. **El ancla de `aire.json`**: subir/borrar/editar música no corta la canción al aire de nadie.
5. **Doble llave (cookie CHIPS + Bearer)**: nació de un bug real — dentro del iframe de la vista previa las cookies de terceros no llegaban y el panel "entraba pero nunca abría".
6. **Tokens HMAC que expiran y rotan**: el hash fijo del PIN no se podía revocar; cambiar el PIN ahora mata todas las sesiones de golpe.
7. **Defensa en profundidad**: el proxy filtra pronto, cada ruta re-verifica; los endpoints de archivos son públicos por necesidad pero solo sirven de su carpeta y con nombre validado.
8. **El molde de letras**: la plantilla es de entrega; lo guardado queda pelado e idempotente, igual que las letras de LRCLIB.
9. **Canvas portable**: desenfoque y esquinas a mano porque Safari viejo no trae `ctx.filter` ni `roundRect` — las imágenes compartibles salen idénticas en cualquier navegador.
10. **Degeneración elegante**: sin datos, mensajes honestos y guiones; nada se inventa jamás.
11. **Panel visualmente distinto de la radio**: dos productos, dos idiomas — trabajar no debería sentirse como escuchar.
12. **Lo mínimo bajo demanda**: las hojas con canvas y las secciones pesadas del panel son `dynamic()`; la primera visita solo baja lo que usa.

---

## 11. Límites conocidos

- **Oyentes en memoria**: el contador vive en el proceso; con varias instancias haría falta un store compartido (Redis o similar). Para una instancia, sobra.
- **`listeners` devuelve 503 si nadie**: es a propósito (el guion del reproductor), pero puede sorprender a quien espere un `0`.
- **La memo de la señal dura 5 min** o hasta que cambie el índice: una edición hecha directamente en disco sin tocar el índice tardaría en verse.
- **Caveman no trae acentos ni `¡¿`**: cae a Baloo 2 en esos caracteres (diseñado así a propósito).
- **El CSP conserva `unsafe-inline`** en script/style: es lo que exige el runtime de App Router.
- **`ignoreBuildErrors: true`** en la config de TS de Next: el typecheck real se hace con `tsc --noEmit` (pasa limpio); el flag evita que un error de tipos bloquee un build por una regla nueva de Next.
- **Lint**: quedan avisos de las reglas estrictas de react-hooks (setState síncrono en efectos de carga y memoización manual) y un falso positivo de `alt-text` con el ícono `Image` de lucide. Son patrones deliberados de carga; no afectan el comportamiento.
