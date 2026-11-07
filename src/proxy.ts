import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy de red (el "middleware" de Next.js): la cerca del gestor y los
 * escudos anti-ataque, todo en un solo lugar antes de que las rutas corran.
 *
 * ── LA CERCA (lo que ya existía) ─────────────────────────────────
 * - `/gestor` y `/acceso` salen de los buscadores (noindex + no-store);
 *   la llave de verdad se verifica en cada API.
 * - `/api/biblioteca/**` sin cookie ni Bearer válido → 401 JSON temprano.
 *   Las rutas privadas vuelven a verificar adentro: defensa en profundidad.
 * - Las rutas de archivos que un `<img>` o `<audio>` necesita (audio,
 *   portadas, fotos) son públicas a propósito: un tag no puede mandar llave.
 * - Si el secreto no es legible, la cerca pasa de largo y las rutas deciden.
 *
 * ── LOS ESCUDOS (nuevos, con perilla en .env.local) ──────────────
 * Se leen en CADA petición (no en el build): cambiar el valor y reiniciar
 * con `npm start` basta, sin reconstruir nada.
 *
 * 1) Candado de iframes (BLOQUEAR_IFRAMES=1): añade en caliente
 *    X-Frame-Options: SAMEORIGIN y frame-ancestors a la CSP — nadie
 *    incrusta la web en un marco ajeno. Apagado por defecto porque la
 *    vista previa de desarrollo vive dentro de un iframe.
 *    FRAME_ANCESTORS_EXTRA autoriza dominios puntuales, con comas.
 *
 * 2) Límite de peticiones por IP (rate limiting de capa 7). Ventana
 *    fija de 60 s contada en memoria — el servidor standalone es un
 *    solo proceso, así que un Map basta. Frena scripts, bots y F5
 *    desquiciados sin molestar a un oyente real: la radio entera
 *    (centinela de cambios + contador de oyentes + portadas) sondea
 *    unos 40 pedidos por minuto; el límite por defecto deja 6× de más.
 *
 * 3) Anti-hotlinking opcional del audio y las portadas: con
 *    BLOQUEAR_HOTLINK=1 solo pasa el reproductor cuyo Referer sea un
 *    origen propio (o venga vacío, como en apps, reproductores de
 *    escritorio y navegadores con privacidad estricta). Las páginas
 *    ajenas que apunten directo a tus mp3 reciben 403. Si además
 *    pones ORIGENES_PROPIOS, la lista manda sobre el Host de la
 *    petición (modo estricto: ni un DNS travieso colándose).
 *
 * Perillas (en .env.local):
 *   BLOQUEAR_IFRAMES=1   nadie incrusta la web en iframes ajenos
 *   FRAME_ANCESTORS_EXTRA=https://socio.com  orígenes autorizados extra
 *   LIMITE_GET_MIN=240   lecturas por minuto e IP (GET/HEAD)
 *   LIMITE_POST_MIN=30   mutaciones por minuto e IP (POST/PUT/DELETE…)
 *   BLOQUEAR_HOTLINK=1   prende el candado del audio y las portadas
 *   ORIGENES_PROPIOS=https://chiripa.radio,https://www.chiripa.radio
 *
 * Nota: el límite del login del gestor es aparte y más estricto
 * (8 intentos / 5 min en lib/llave-servidor.ts); este proxy lo cubre
 * sin estorbarlo.
 */

const NOMBRE_COOKIE = "chiripa-gestor";
const PREFIJO_BEARER = "Bearer ";
const ARCHIVO_LLAVE = "media/llave.json";

const CABECERAS_PUERTA = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
};

/* ── Rate limiting: ventana fija de 60 s por IP y clase ────────── */

const VENTANA_MS = 60_000;

/** Contadores por IP: clave `${ip}:${clase}` → { n, desde }. */
const contadores = new Map<string, { n: number; desde: number }>();

/** Techo de memoria: al pasarlo se barren las ventanas vencidas. */
const MAX_CONTADORES = 4096;

function numeroDeEntorno(nombre: string, defecto: number): number {
  const crudo = Number.parseInt(process.env[nombre] ?? "", 10);
  return Number.isFinite(crudo) && crudo > 0 ? crudo : defecto;
}

function limpiarVencidos(): void {
  const ya = Date.now();
  for (const [clave, marca] of contadores) {
    if (ya - marca.desde > VENTANA_MS) contadores.delete(clave);
  }
}

/**
 * ¿Pasa esta petición? Devuelve null si sí, o los segundos que faltan
 * para que la ventana se reinicie si ya se gastó el cupo.
 */
function cupoDisponible(clave: string, maximo: number): number | null {
  const ya = Date.now();
  const marca = contadores.get(clave);

  if (!marca || ya - marca.desde > VENTANA_MS) {
    if (contadores.size > MAX_CONTADORES) limpiarVencidos();
    contadores.set(clave, { n: 1, desde: ya });
    return null;
  }

  marca.n += 1;
  if (marca.n <= maximo) return null;
  return Math.max(1, Math.ceil((marca.desde + VENTANA_MS - ya) / 1000));
}

function ipDe(req: NextRequest): string {
  const reenviada = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (reenviada) return reenviada;
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/* ── Anti-hotlinking: el Referer manda, pero el vacío siempre pasa ── */

/** Rutas que sirven el contenido robable: audio, portadas y fotos
 *  (las que responde un GET público a un <img> o <audio>). */
const RUTAS_CALADAS = [
  "/api/biblioteca/audio/",
  "/api/biblioteca/portada/",
  "/api/biblioteca/albumes/portada/",
  "/api/biblioteca/cuenta-foto/",
];

function refererPermitido(req: NextRequest): boolean {
  const referer = req.headers.get("referer");
  // Sin Referer no hay forma de saber de dónde viene: apps, reproductores
  // de escritorio y navegadores con privacidad estricta viajan así.
  if (!referer) return true;

  let origen: string;
  try {
    origen = new URL(referer).origin;
  } catch {
    return false;
  }

  const propios = (process.env.ORIGENES_PROPIOS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (propios.length) {
    // Modo estricto: solo los dominios declarados.
    return propios.includes(origen);
  }

  // Modo cómodo: se acepta el propio Host de la petición.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;
  return origen === `https://${host}` || origen === `http://${host}`;
}

/* ── La llave de la cerca (HMAC con Web Crypto, como siempre) ───── */

let cacheSecreto: Uint8Array<ArrayBuffer> | null = null;
let cacheLeido = false;

// forzar=true relee media/llave.json aunque ya haya caché. Se usa cuando un
// token no cuadra: cambiar el PIN rota el secreto (llave-servidor.ts) y sin
// esto la caché quedaría vieja hasta reiniciar — el bug del loop del panel.
async function leerSecreto(forzar = false): Promise<Uint8Array<ArrayBuffer> | null> {
  if (cacheLeido && !forzar) return cacheSecreto;
  cacheLeido = true;
  cacheSecreto = null;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const datos = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), ARCHIVO_LLAVE), "utf8"),
    ) as { secreto?: string };
    if (datos?.secreto && /^[0-9a-f]{64}$/.test(datos.secreto)) {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(datos.secreto.slice(i * 2, i * 2 + 2), 16);
      }
      cacheSecreto = bytes;
    }
  } catch {
    /* sin secreto legible: la cerca pasa de largo (las rutas verifican) */
  }
  return cacheSecreto;
}

function bytesDeB64url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function tokenFirmadoValido(token: string): Promise<boolean> {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== "v1") return false;
  try {
    const cuadra = async (secreto: Uint8Array<ArrayBuffer>): Promise<boolean> => {
      const llave = await crypto.subtle.importKey(
        "raw",
        secreto,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const firma = bytesDeB64url(partes[2]);
      const datos = new TextEncoder().encode(`v1.${partes[1]}`);
      if (!(await crypto.subtle.verify("HMAC", llave, firma, datos))) return false;
      const payload = JSON.parse(
        new TextDecoder().decode(bytesDeB64url(partes[1])),
      ) as { exp?: number };
      return typeof payload.exp === "number" && Date.now() < payload.exp;
    };
    const secreto = await leerSecreto();
    if (secreto && (await cuadra(secreto))) return true;
    // La firma no cuadra (o aún no hay secreto en caché): el secreto pudo
    // rotar — p. ej. al cambiar el PIN — así que se relee llave.json una vez
    // y se reintenta antes de rechazar. Sin esto el panel entra en loop
    // (PIN correcto → 401 → puerta) hasta reiniciar el proceso.
    const fresco = await leerSecreto(true);
    return !!fresco && (await cuadra(fresco));
  } catch {
    return false;
  }
}

async function tieneLlave(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get(NOMBRE_COOKIE)?.value ?? "";
  if (cookie.startsWith("v1.") && (await tokenFirmadoValido(cookie))) return true;
  const autorizacion = req.headers.get("authorization") ?? "";
  if (autorizacion.startsWith(PREFIJO_BEARER)) {
    const token = autorizacion.slice(PREFIJO_BEARER.length).trim();
    if (token.startsWith("v1.") && (await tokenFirmadoValido(token))) return true;
  }
  return false;
}

function esPublicoDeLaRadio(ruta: string): boolean {
  return (
    ruta.startsWith("/api/biblioteca/sesion") ||
    ruta.startsWith("/api/biblioteca/audio/") ||
    ruta.startsWith("/api/biblioteca/portada/") ||
    ruta.startsWith("/api/biblioteca/albumes/portada/") ||
    ruta.startsWith("/api/biblioteca/cuenta-foto/")
  );
}

/* ── Candado de iframes: se cuelga de cualquier respuesta ───────── */

function conCandado(res: NextResponse): NextResponse {
  if (process.env.BLOQUEAR_IFRAMES !== "1") return res;
  const extra = (process.env.FRAME_ANCESTORS_EXTRA ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set(
    "Content-Security-Policy",
    ["frame-ancestors 'self'", ...extra].join(" "),
  );
  return res;
}

// Dos direcciones con un solo trabajo cada una: /acceso es la puerta (identificarse)
// y /gestor es el panel de trabajo. El proxy no redirige a ninguna de las dos:
// solo las saca de los buscadores; la llave de verdad se verifica en cada API.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Anti-hotlinking del audio y las portadas: lo más barato primero.
  if (
    process.env.BLOQUEAR_HOTLINK === "1" &&
    req.method === "GET" &&
    RUTAS_CALADAS.some((ruta) => pathname.startsWith(ruta)) &&
    !refererPermitido(req)
  ) {
    return NextResponse.json(
      { error: "Este contenido solo suena desde Radio Chiripa." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 2) Rate limiting por IP para TODAS las APIs (radio y biblioteca).
  if (pathname.startsWith("/api/")) {
    const clase = req.method === "GET" || req.method === "HEAD" ? "lectura" : "cambio";
    const maximo =
      clase === "lectura"
        ? numeroDeEntorno("LIMITE_GET_MIN", 240)
        : numeroDeEntorno("LIMITE_POST_MIN", 30);
    const espera = cupoDisponible(`${ipDe(req)}:${clase}`, maximo);
    if (espera !== null) {
      return NextResponse.json(
        { error: "Demasiadas peticiones: vamos con calma." },
        {
          status: 429,
          headers: { "Retry-After": String(espera), "Cache-Control": "no-store" },
        },
      );
    }
  }

  // 3) La cerca original: exenciones, puerta y 401 temprano.
  if (esPublicoDeLaRadio(pathname)) return conCandado(NextResponse.next());

  if (
    pathname === "/gestor" ||
    pathname.startsWith("/gestor/") ||
    pathname === "/acceso" ||
    pathname.startsWith("/acceso/")
  ) {
    return conCandado(
      NextResponse.next({ headers: CABECERAS_PUERTA }),
    );
  }

  // La cerca de verdad: solo las rutas privadas de /api/biblioteca
  // (las públicas de la radio y la portada siguen de largo).
  if (pathname.startsWith("/api/biblioteca/")) {
    const valida = await tieneLlave(req);
    if (valida) {
      return conCandado(
        NextResponse.next({ headers: { "X-Robots-Tag": "noindex, nofollow" } }),
      );
    }
    if (cacheSecreto === null && !cacheLeido) {
      await leerSecreto();
      if (cacheSecreto === null) return conCandado(NextResponse.next());
    }
    if (cacheSecreto === null) return conCandado(NextResponse.next());
    return Response.json(
      { conectado: false, error: "Sesión del gestor no válida" },
      { status: 401 },
    );
  }

  return conCandado(NextResponse.next());
}

export const config = {
  // Todo excepto los assets estáticos (que no necesitan candados y
  // se sirven mejor sin pasar por aquí).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
