import { sesionCuenta, leerCuentaPorId, type CuentaPublica } from "./cuentas";
import {
  SUB_DUENO,
  firmarTokenSesion,
  verificarTokenSesion,
} from "./llave-servidor";

const NOMBRE_COOKIE = "chiripa-gestor";
const PREFIJO_BEARER = "Bearer ";

// Partitioned (CHIPS) porque el panel se abre dentro de iframes; SameSite=None/Secure es lo que la hace legible ahí.
export function cookieSesion(token: string): string {
  return `${NOMBRE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=None; Secure; Partitioned; Max-Age=${60 * 60 * 24 * 30}`;
}

export function cookieBorrada(): string {
  return `${NOMBRE_COOKIE}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`;
}

function llavesDe(req: Request): string[] {
  const llaves: string[] = [];
  const crudas = req.headers.get("cookie") ?? "";
  for (const parte of crudas.split(";")) {
    const [nombre, ...resto] = parte.trim().split("=");
    if (nombre === NOMBRE_COOKIE && resto.join("=")) llaves.push(resto.join("="));
  }
  const autorizacion = req.headers.get("authorization") ?? "";
  if (autorizacion.startsWith(PREFIJO_BEARER)) {
    const token = autorizacion.slice(PREFIJO_BEARER.length).trim();
    if (token) llaves.push(token);
  }
  return llaves;
}

export function sesionValidaConToken(req: Request): boolean {
  return quienEntra(req) !== null;
}

export function tokenDeSesion(): string {
  return firmarTokenSesion(SUB_DUENO, "dueno");
}

export type QuienSesion =
  | { tipo: "pin"; nombre: string; rol: "dueno"; foto?: undefined }
  | {
      tipo: "cuenta";
      nombre: string;
      rol: string;
      foto?: string;
      cuenta: CuentaPublica;
    };

export function quienEntra(req: Request): QuienSesion | null {
  for (const llave of llavesDe(req)) {
    const token = verificarTokenSesion(llave);
    if (token && token.sub === SUB_DUENO && token.rol === "dueno") {
      return { tipo: "pin", nombre: "Dueño de la radio", rol: "dueno" };
    }
  }
  for (const llave of llavesDe(req)) {
    const cuenta = sesionCuenta(llave);
    if (cuenta) {
      return {
        tipo: "cuenta",
        nombre: cuenta.nombre,
        rol: cuenta.rol,
        foto: cuenta.foto,
        cuenta,
      };
    }
  }
  return null;
}

export function esDueno(req: Request): boolean {
  const quien = quienEntra(req);
  return !!quien && quien.rol === "dueno";
}

export { leerCuentaPorId };
