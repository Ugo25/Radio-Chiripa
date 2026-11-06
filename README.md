# Radio Chiripa

La web del **Festival Chiripa 2026** (8 de noviembre de 2026 · Shekinah Beach Club, Mazatlán): una radio en vivo que transmite la música de la casa, sincronizada contra el reloj del mundo, más el panel privado para administrarla.

Construido con **Next.js 16** y **React 19**. Sin base de datos: todo el estado (canciones, letras, cuentas, señal) vive en archivos JSON dentro de `media/` — respaldar la radio es copiar una carpeta.

```
Radio pública (/)              Panel del gestor (/acceso → /gestor)
├─ Radio en vivo sincronizada  ├─ Biblioteca: subir y editar canciones
├─ Letra de la canción al aire ├─ Álbumes y artistas
├─ Cartel, boletos y sobre     ├─ Letras (automáticas de LRCLIB o a mano)
├─ Historia y tarjeta p/ IG    ├─ Cuentas con roles (dueño / colaborador)
└─ Compartir en X e Instagram  ├─ Control al aire: monitoreo, pánico,
                                │  silencio nocturno y audiencia de 24 h
                                └─ Tema negro o blanco
```

## Requisitos

- **Node.js 20** o superior
- npm (viene con Node)

## Puesta en marcha

```bash
npm install
```

Crea un archivo `.env.local` en la raíz (no va al git):

```bash
# PIN maestro del dueño para entrar al panel
GESTOR_PIN=tu-pin-secreto

# Dirección pública de la radio (se imprime en las imágenes para compartir)
NEXT_PUBLIC_SITE_URL=https://tudominio.com

# Opcional: portadas que faltan se buscan en Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

Levanta el desarrollo en `http://localhost:3000`:

```bash
npm run dev
```

La radio está en `/`. El panel tiene puerta propia: **`/acceso`** es donde se identifica uno (PIN del dueño o cuenta) y **`/gestor`** es el panel de trabajo — sin sesión, `/gestor` manda a la puerta; con sesión, `/acceso` lleva directo al panel.

## Producción

```bash
npm run build   # compila y prepara .next/standalone (assets, public y media enlazados)
npm start       # arranca el servidor de producción (carga .env.local solo)
```

`npm start` funciona igual en Windows, macOS y Linux: los scripts `arrancar.mjs` y `copiar-standalone.mjs` son Node puro, sin comandos de shell.

## Variables de entorno

| Variable | Requerida | Para qué |
| --- | --- | --- |
| `GESTOR_PIN` | En producción | PIN del dueño. Sin él (y sin un PIN guardado en el panel), el acceso por PIN queda cerrado. |
| `NEXT_PUBLIC_SITE_URL` | Opcional | URL pública; se dibuja en la historia de Instagram y la tarjeta de la letra. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Opcional | Buscar portadas faltantes en Spotify (nunca audio). |

El PIN también se puede cambiar desde el panel (**Configuración**): el nuevo se guarda cifrado (scrypt + sal) en `media/config.json` y rota el secreto de las sesiones, cerrando todas las llaves abiertas.

## Cómo funciona

- **La señal es matemática, no azar**: la biblioteca activa se pone en bucle y la canción "al aire" sale de `(ahora − origen) % duraciónTotal`. Todos los oyentes escuchan lo mismo en el mismo minuto, como una radio de verdad. Nadie puede adelantar ni atrasar: los controles del sistema quedan neutros y cualquier salto externo devuelve al minuto en vivo.
- **El silencio corta de verdad**: el botón de pánico (o el silencio nocturno programado en hora de Mazatlán) vacía la señal; el reproductor de cada oyente pausa el audio al instante y la escucha vuelve sola cuando la señal regresa, justo donde iba.
- **Sin base de datos**: `media/` guarda el índice de la biblioteca, los MP3, portadas, letras, cuentas, el ancla de la señal y el historial de oyentes. Respaldar = copiar la carpeta.
- **Respaldo completo en un clic**: Configuración → Datos arma un ZIP con todo lo que no es audio (letras —también las pegadas a mano—, álbumes, cuentas, silencio nocturno, audiencia, imágenes y un .txt por letra). «Importar respaldo» lo devuelve — y si re-subiste las canciones desde cero, letras y metadatos se re-enganchan solos emparejando por la huella digital (SHA-256) del archivo. El PIN y las sesiones no se tocan.
- **Seguridad propia**: contraseñas y PIN con scrypt, tokens firmados con HMAC que expiran a los 30 días, rate limit en el login y cabeceras OWASP.

`DOCUMENTACION.md` explica cada pieza a fondo (el reloj de la señal, el ancla, la vela del silencio, las dos llaves de sesión, la cerca del proxy…).

## Estructura

```
src/
├─ app/
│  ├─ page.tsx            La radio pública
│  ├─ gestor/page.tsx     El panel (tras el PIN o la cuenta)
│  ├─ acceso/page.tsx     La puerta (login) del panel
│  └─ api/
│     ├─ radio/           Público: now-playing, listeners, historial, señal, letras
│     └─ biblioteca/      Privado: canciones, álbumes, letras, cuentas, sesión, respaldo
├─ components/
│  ├─ chiripa/            Radio: reproductor, hojas (letra, cartel, sobre, compartir…)
│  └─ gestor/             Panel: resumen, biblioteca, álbumes, letras, cuentas, config
└─ lib/                   La lógica: señal, biblioteca, letras, cuentas, tokens, respaldo…

media/                    Los datos de la radio (JSON + música + imágenes)
public/                   Logo, cartel y robots.txt
scripts/                  Arranque y empaquetado para producción
```

## Notas de despliegue

- El build sale en `output: "standalone"`: para servirlo detrás de un proxy inverso, apunta al puerto 3000 (o al que diga `PORT`).
- `media/` está en el `.gitignore`: el repositorio lleva el código, no la música. En el servidor, la carpeta se crea sola al primer arranque.
- Actualizar la radio en el servidor: `git pull && npm install && npm run build && pm2 restart chiripa` (o el gestor de procesos que uses).

## Licencia

Proyecto privado del Festival Chiripa. Todos los derechos de la música y el arte pertenecen a sus autores.
