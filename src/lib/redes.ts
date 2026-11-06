import fs from "node:fs";
import path from "node:path";
import { adivinarIcono, iconoValido, type Red } from "./redes-compartir";

/**
 * Redes sociales y sitios de la radio: una lista corta que vive en
 * media/redes.json y se muestra en el encabezado del reproductor y en la
 * tarjeta de Sobre Chiripa. La edita el dueño desde Configuración; sin
 * archivo (o vacía) la radio usa sus cuentas de siempre.
 */

const ARCHIVO = path.join(process.cwd(), "media", "redes.json");

const MAX_REDES = 8;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sanear(entrada: unknown): Red | null {
  if (!entrada || typeof entrada !== "object") return null;
  const crudo = entrada as Record<string, unknown>;
  const nombre = texto(crudo.nombre).slice(0, 40);
  const url = texto(crudo.url).slice(0, 300);
  if (!nombre || !url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  const icono = iconoValido(crudo.icono) || adivinarIcono(url);
  return { nombre, url, icono };
}

export function leerRedes(): Red[] {
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO, "utf8")) as {
      redes?: unknown;
    };
    const lista = Array.isArray(datos.redes) ? datos.redes : [];
    return lista
      .map(sanear)
      .filter((r): r is Red => r !== null)
      .slice(0, MAX_REDES);
  } catch {
    return [];
  }
}

export function escribirRedes(entrada: unknown): Red[] {
  const lista = Array.isArray(entrada) ? entrada : [];
  const redes = lista
    .map(sanear)
    .filter((r): r is Red => r !== null)
    .slice(0, MAX_REDES);
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  const temporal = `${ARCHIVO}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify({ redes }, null, 2), "utf8");
  fs.renameSync(temporal, ARCHIVO);
  return redes;
}
