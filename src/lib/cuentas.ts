import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { firmarTokenSesion, secretoSesiones, verificarTokenSesion } from "./llave-servidor";

const ARCHIVO_CUENTAS = path.join(process.cwd(), "media", "cuentas.json");
export const DIR_FOTOS_CUENTAS = path.join(process.cwd(), "media", "cuentas");

export type Rol = "dueno" | "colaborador";

type CuentaInterna = {
  id: string;
  nombre: string;
  correo?: string;
  usuario?: string;
  foto?: string;
  rol: Rol;
  activo: boolean;
  creadoISO: string;
  ultimaEntradaISO?: string;
  sal: string;
  hash: string;
};

export type CuentaPublica = {
  id: string;
  nombre: string;
  correo?: string;
  usuario?: string;
  foto?: string;
  rol: Rol;
  activo: boolean;
  creadoISO: string;
  ultimaEntradaISO?: string;
};

function secretoCuentas(): Buffer {
  return secretoSesiones();
}

function hashContrasena(contrasena: string, sal: string): string {
    // scrypt con sal propia por cuenta.
  return crypto.scryptSync(contrasena, sal, 64).toString("hex");
}

function nuevaCredencial(contrasena: string): { sal: string; hash: string } {
  const sal = crypto.randomBytes(16).toString("hex");
  return { sal, hash: hashContrasena(contrasena, sal) };
}

function leer(): CuentaInterna[] {
  try {
    const lista = JSON.parse(fs.readFileSync(ARCHIVO_CUENTAS, "utf8")) as CuentaInterna[];
    if (!Array.isArray(lista)) return [];
    return lista.filter((c) => c && c.id && typeof c.nombre === "string");
  } catch {
    return [];
  }
}

function escribir(lista: CuentaInterna[]): void {
  fs.mkdirSync(path.dirname(ARCHIVO_CUENTAS), { recursive: true });
  fs.writeFileSync(ARCHIVO_CUENTAS, JSON.stringify(lista, null, 2), "utf8");
}

function publica(c: CuentaInterna): CuentaPublica {
  return {
    id: c.id,
    nombre: c.nombre,
    correo: c.correo,
    usuario: c.usuario,
    foto: c.foto,
    rol: c.rol,
    activo: c.activo,
    creadoISO: c.creadoISO,
    ultimaEntradaISO: c.ultimaEntradaISO,
  };
}

export function firmarSesionCuenta(cuenta: CuentaInterna): string {
  return firmarTokenSesion(cuenta.id, cuenta.rol);
}

export function firmaValida(token: string): { sub: string; rol: Rol } | null {
  const datos = verificarTokenSesion(token);
  if (!datos) return null;
  return { sub: datos.sub, rol: datos.rol };
}

export function sesionCuenta(token: string): CuentaPublica | null {
  const datos = firmaValida(token);
  if (!datos) return null;
  const cuenta = leer().find((c) => c.id === datos.sub);
  if (!cuenta || !cuenta.activo) return null;
  return publica(cuenta);
}

export function leerCuentaPorId(id: string): CuentaPublica | null {
  const cuenta = leer().find((c) => c.id === id);
  return cuenta ? publica(cuenta) : null;
}

function contrasenaCorrecta(cuenta: CuentaInterna, contrasena: string): boolean {
  const hash = hashContrasena(contrasena, cuenta.sal);
  const a = Buffer.from(hash);
  const b = Buffer.from(cuenta.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function entrarConCuenta(
  identidad: string,
  contrasena: string,
): { cuenta: CuentaPublica; token: string } | null {
  const limpia = identidad.trim().toLowerCase();
  if (!limpia || !contrasena) return null;
  const cuenta = leer().find(
    (c) =>
      (c.correo && c.correo.toLowerCase() === limpia) ||
      (c.usuario && c.usuario.toLowerCase() === limpia),
  );
  if (!cuenta || !cuenta.activo) return null;
  if (!contrasenaCorrecta(cuenta, contrasena)) return null;
  cuenta.ultimaEntradaISO = new Date().toISOString();
  escribir(leer().map((c) => (c.id === cuenta.id ? cuenta : c)));
  return { cuenta: publica(cuenta), token: firmarSesionCuenta(cuenta) };
}

export type DatosCuenta = {
  nombre: string;
  correo?: string;
  usuario?: string;
  contrasena: string;
  rol: Rol;
  foto?: string;
  activo?: boolean;
};

function limpiarCorreo(correo?: string): string | undefined {
  const limpio = correo?.trim().toLowerCase() ?? "";
  if (!limpio) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : undefined;
}

function limpiarUsuario(usuario?: string): string | undefined {
  const limpio = usuario?.trim().toLowerCase() ?? "";
  if (!limpio) return undefined;
  return /^[a-z0-9._-]{3,40}$/.test(limpio) ? limpio : undefined;
}

export function crearCuenta(datos: DatosCuenta): CuentaPublica {
  const nombre = datos.nombre.trim().slice(0, 80);
  const correo = limpiarCorreo(datos.correo);
  const usuario = limpiarUsuario(datos.usuario);
  const contrasena = datos.contrasena ?? "";

  if (!nombre) throw new Error("la cuenta necesita un nombre");
  if (!correo && !usuario) {
    throw new Error("hace falta un correo o un usuario para entrar");
  }
  if (contrasena.length < 6) {
    throw new Error("la contraseña necesita al menos 6 caracteres");
  }
  if (datos.rol !== "dueno" && datos.rol !== "colaborador") {
    throw new Error("el rol no es válido");
  }

  const lista = leer();
  if (correo && lista.some((c) => c.correo?.toLowerCase() === correo)) {
    throw new Error("ya existe una cuenta con ese correo");
  }
  if (usuario && lista.some((c) => c.usuario?.toLowerCase() === usuario)) {
    throw new Error("ya existe una cuenta con ese usuario");
  }

  const credencial = nuevaCredencial(contrasena);
  const cuenta: CuentaInterna = {
    id: `c-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    nombre,
    correo,
    usuario,
    foto: datos.foto,
    rol: datos.rol,
    activo: datos.activo ?? true,
    creadoISO: new Date().toISOString(),
    ...credencial,
  };
  escribir([...lista, cuenta]);
  return publica(cuenta);
}

export function editarCuenta(
  id: string,
  cambios: Partial<DatosCuenta> & { activo?: boolean },
): CuentaPublica | null {
  const lista = leer();
  const i = lista.findIndex((c) => c.id === id);
  if (i < 0) return null;

  if (typeof cambios.nombre === "string") {
    const nombre = cambios.nombre.trim().slice(0, 80);
    if (!nombre) throw new Error("la cuenta necesita un nombre");
    lista[i].nombre = nombre;
  }
  if (cambios.correo !== undefined) {
    const correo = limpiarCorreo(cambios.correo);
    if (correo && lista.some((c, j) => j !== i && c.correo?.toLowerCase() === correo)) {
      throw new Error("ya existe una cuenta con ese correo");
    }
    lista[i].correo = correo;
  }
  if (cambios.usuario !== undefined) {
    const usuario = limpiarUsuario(cambios.usuario);
    if (usuario && lista.some((c, j) => j !== i && c.usuario?.toLowerCase() === usuario)) {
      throw new Error("ya existe una cuenta con ese usuario");
    }
    lista[i].usuario = usuario;
  }
  if (!lista[i].correo && !lista[i].usuario) {
    throw new Error("hace falta un correo o un usuario para entrar");
  }
  if (typeof cambios.rol === "string") {
    if (cambios.rol !== "dueno" && cambios.rol !== "colaborador") {
      throw new Error("el rol no es válido");
    }
    lista[i].rol = cambios.rol;
  }
  if (typeof cambios.activo === "boolean") {
    lista[i].activo = cambios.activo;
  }
  if (cambios.foto !== undefined) {
    lista[i].foto = cambios.foto || undefined;
  }
  if (typeof cambios.contrasena === "string" && cambios.contrasena) {
    if (cambios.contrasena.length < 6) {
      throw new Error("la contraseña necesita al menos 6 caracteres");
    }
    Object.assign(lista[i], nuevaCredencial(cambios.contrasena));
  }
  escribir(lista);
  return publica(lista[i]);
}

export function eliminarCuenta(id: string): boolean {
  const lista = leer();
  const cuenta = lista.find((c) => c.id === id);
  if (!cuenta) return false;
  if (cuenta.foto?.startsWith("/api/biblioteca/cuenta-foto/")) {
    try {
      fs.rmSync(
        path.join(DIR_FOTOS_CUENTAS, path.basename(cuenta.foto)),
        { force: true },
      );
    } catch {
      /* la cuenta se borra igual */
    }
  }
  escribir(lista.filter((c) => c.id !== id));
  return true;
}

export function leerCuentas(): CuentaPublica[] {
  return leer()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map(publica);
}

// Recupera cuentas de un respaldo: solo agrega las que no existen (por id o
// por credencial); jamás toca las actuales — las sesiones vivas siguen vivas.
export function recuperarCuentas(entrantes: unknown[]): number {
  const actuales = leer();
  const ids = new Set(actuales.map((c) => c.id));
  const credenciales = new Set(
    actuales.map((c) => `${c.correo?.toLowerCase() ?? ""}|${c.usuario?.toLowerCase() ?? ""}`),
  );
  let agregadas = 0;

  for (const entrante of entrantes) {
    if (!entrante || typeof entrante !== "object") continue;
    const cuenta = entrante as Partial<CuentaInterna>;
    if (
      typeof cuenta.id !== "string" ||
      !cuenta.id ||
      typeof cuenta.nombre !== "string" ||
      !cuenta.nombre.trim() ||
      typeof cuenta.sal !== "string" ||
      !cuenta.sal ||
      typeof cuenta.hash !== "string" ||
      !cuenta.hash ||
      (cuenta.rol !== "dueno" && cuenta.rol !== "colaborador")
    ) {
      continue;
    }
    if (ids.has(cuenta.id)) continue;
    const llave = `${cuenta.correo?.toLowerCase() ?? ""}|${cuenta.usuario?.toLowerCase() ?? ""}`;
    if (credenciales.has(llave)) continue;

    actuales.push({
      id: cuenta.id,
      nombre: cuenta.nombre.trim().slice(0, 80),
      correo: cuenta.correo,
      usuario: cuenta.usuario,
      foto: cuenta.foto,
      rol: cuenta.rol,
      activo: cuenta.activo !== false,
      creadoISO:
        typeof cuenta.creadoISO === "string" ? cuenta.creadoISO : new Date().toISOString(),
      sal: cuenta.sal,
      hash: cuenta.hash,
    });
    ids.add(cuenta.id);
    credenciales.add(llave);
    agregadas++;
  }

  if (agregadas) escribir(actuales);
  return agregadas;
}

const TIPOS_FOTO: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function guardarFotoCuenta(datos: Buffer, mime: string): string {
  const ext = TIPOS_FOTO[mime?.toLowerCase() ?? ""];
  if (!ext) throw new Error("usa una foto JPG, PNG o WebP");
  if (datos.length > 5 * 1024 * 1024) throw new Error("la foto pasa de 5 MB");
  fs.mkdirSync(DIR_FOTOS_CUENTAS, { recursive: true });
  const nombre = `c-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(DIR_FOTOS_CUENTAS, nombre), datos);
  return `/api/biblioteca/cuenta-foto/${nombre}`;
}
