import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ARCHIVO_LLAVE = path.join(process.cwd(), "media", "llave.json");
const ARCHIVO_CONFIG = path.join(process.cwd(), "media", "config.json");

export const VIDA_SESION_MS = 30 * 24 * 60 * 60 * 1000;

export const SUB_DUENO = "dueno-pin";

let cacheSecreto: Buffer | null = null;

export function secretoSesiones(): Buffer {
  if (cacheSecreto) return cacheSecreto;
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO_LLAVE, "utf8")) as {
      secreto?: string;
    };
    if (datos?.secreto && /^[0-9a-f]{64}$/.test(datos.secreto)) {
      cacheSecreto = Buffer.from(datos.secreto, "hex");
      return cacheSecreto;
    }
  } catch {
    /* no existe o ilegible: se genera abajo */
  }
  const secreto = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(ARCHIVO_LLAVE), { recursive: true });
    fs.writeFileSync(
      ARCHIVO_LLAVE,
      JSON.stringify(
        { secreto: secreto.toString("hex"), creadoISO: new Date().toISOString() },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* sin disco escribible: el secreto vive solo en memoria */
  }
  cacheSecreto = secreto;
  return secreto;
}

export function rotarSecretoSesiones(): void {
  cacheSecreto = null;
  try {
    fs.rmSync(ARCHIVO_LLAVE, { force: true });
  } catch {
    /* si no se pudo borrar, el nuevo igual sobreescribe al leer */
  }
  secretoSesiones();
}

export type SesionToken = {
  sub: string;
  rol: "dueno" | "colaborador";
  exp: number;
};

function b64url(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64url");
}

function desdeB64url(texto: string): string {
  return Buffer.from(texto, "base64url").toString("utf8");
}

// v1.<payload>.<firma HMAC>: expira a los 30 días, y cambiar el PIN rota el secreto y mata todas las sesiones.
export function firmarTokenSesion(sub: string, rol: "dueno" | "colaborador"): string {
  const payload = b64url(
    JSON.stringify({ sub, rol, exp: Date.now() + VIDA_SESION_MS }),
  );
  const firma = crypto
    .createHmac("sha256", secretoSesiones())
    .update(`v1.${payload}`)
    .digest("base64url");
  return `v1.${payload}.${firma}`;
}

export function verificarTokenSesion(token: string): SesionToken | null {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== "v1") return null;
  const esperada = crypto
    .createHmac("sha256", secretoSesiones())
    .update(`v1.${partes[1]}`)
    .digest("base64url");
  const a = Buffer.from(partes[2]);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(desdeB64url(partes[1])) as Partial<SesionToken>;
    if (!datos.sub || !datos.rol || typeof datos.exp !== "number") return null;
    if (datos.rol !== "dueno" && datos.rol !== "colaborador") return null;
    if (Date.now() > datos.exp) return null;
    return { sub: datos.sub, rol: datos.rol, exp: datos.exp };
  } catch {
    return null;
  }
}

type PinGuardado = { sal: string; hash: string };

function leerPinGuardado(): PinGuardado | null {
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO_CONFIG, "utf8")) as {
      pin?: PinGuardado;
    };
    if (datos?.pin?.sal && datos?.pin?.hash) return datos.pin;
  } catch {
    /* sin PIN guardado */
  }
  return null;
}

export function pinPersonalizado(): boolean {
  return leerPinGuardado() !== null;
}

function hashPin(pin: string, sal: string): string {
  return crypto.scryptSync(pin, sal, 64).toString("hex");
}

function textosIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(
      crypto.createHash("sha256").update(ba).digest(),
      crypto.createHash("sha256").update(ba).digest(),
    );
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function pinEsCorrecto(pin: string): boolean {
  const guardado = leerPinGuardado();
  if (guardado) {
    const hash = Buffer.from(hashPin(pin, guardado.sal));
    const esperado = Buffer.from(guardado.hash);
    return hash.length === esperado.length && crypto.timingSafeEqual(hash, esperado);
  }
  const entorno = process.env.GESTOR_PIN?.trim();
  if (entorno) return textosIguales(pin, entorno);
  if (process.env.NODE_ENV !== "production") {
    return textosIguales(pin, "chiripa2026");
  }
  return false;
}

export function loginPinDisponible(): boolean {
  return (
    leerPinGuardado() !== null ||
    !!process.env.GESTOR_PIN?.trim() ||
    process.env.NODE_ENV !== "production"
  );
}

export function pinDelEntorno(): boolean {
  return !!process.env.GESTOR_PIN?.trim();
}

export function cambiarPin(
  pinActual: string,
  pinNuevo: string,
): { token: string } {
  if (!pinEsCorrecto(pinActual)) {
    throw new Error("El PIN actual no es correcto");
  }
  const limpio = pinNuevo.trim();
  if (limpio.length < 6 || limpio.length > 64) {
    throw new Error("El PIN nuevo necesita entre 6 y 64 caracteres");
  }
  const sal = crypto.randomBytes(16).toString("hex");
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(fs.readFileSync(ARCHIVO_CONFIG, "utf8")) as Record<string, unknown>;
  } catch {
    /* config nueva */
  }
  config.pin = { sal, hash: hashPin(limpio, sal) };
  fs.mkdirSync(path.dirname(ARCHIVO_CONFIG), { recursive: true });
  fs.writeFileSync(ARCHIVO_CONFIG, JSON.stringify(config, null, 2), "utf8");
  rotarSecretoSesiones();
  return { token: firmarTokenSesion(SUB_DUENO, "dueno") };
}

const intentosLogin = new Map<string, { n: number; desde: number }>();
const VENTANA_MS = 5 * 60 * 1000;
const MAX_INTENTOS = 8;

export function ipDe(req: Request): string {
  const reenviada = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (reenviada) return reenviada;
  return req.headers.get("x-real-ip")?.trim() || "local";
}

export function loginPermitido(ip: string): boolean {
  const marca = intentosLogin.get(ip);
  if (!marca) return true;
  if (Date.now() - marca.desde > VENTANA_MS) {
    intentosLogin.delete(ip);
    return true;
  }
  return marca.n < MAX_INTENTOS;
}

export function registrarIntentoFallido(ip: string): void {
  const marca = intentosLogin.get(ip);
  if (!marca || Date.now() - marca.desde > VENTANA_MS) {
    intentosLogin.set(ip, { n: 1, desde: Date.now() });
    return;
  }
  marca.n += 1;
}

export function limpiarIntentos(ip: string): void {
  intentosLogin.delete(ip);
}
