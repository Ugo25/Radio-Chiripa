import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ARCHIVO_ALBUMES = path.join(process.cwd(), "media", "albumes.json");
const DIR_PORTADAS = path.join(process.cwd(), "media", "biblioteca", "caratulas-albumes");

export type TipoAlbum = "album" | "single" | "ep";

export const TIPOS_ALBUM: { id: TipoAlbum; nombre: string }[] = [
  { id: "album", nombre: "Álbum" },
  { id: "single", nombre: "Sencillo" },
  { id: "ep", nombre: "EP" },
];

export type Album = {
  id: string;
  nombre: string;
  tipo?: TipoAlbum;
  creadoISO: string;
  portada?: string;
};

function leer(): Album[] {
  try {
    const lista = JSON.parse(fs.readFileSync(ARCHIVO_ALBUMES, "utf8")) as Album[];
    if (!Array.isArray(lista)) return [];
    return lista.filter(
      (a) => a && a.id && typeof a.nombre === "string" && a.nombre.trim(),
    );
  } catch {
    return [];
  }
}

function escribir(lista: Album[]): void {
  fs.mkdirSync(path.dirname(ARCHIVO_ALBUMES), { recursive: true });
  const temporal = `${ARCHIVO_ALBUMES}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(lista, null, 2), "utf8");
  fs.renameSync(temporal, ARCHIVO_ALBUMES);
}

export function leerAlbumes(): Album[] {
  return leer().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function mapaNombresAlbumes(): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const album of leer()) mapa[album.id] = album.nombre;
  return mapa;
}

export function tipoDeAlbum(album: Album): TipoAlbum {
  return album.tipo ?? "album";
}

function tipoValido(tipo: string): TipoAlbum | null {
  return TIPOS_ALBUM.some((t) => t.id === tipo) ? (tipo as TipoAlbum) : null;
}

export function crearAlbum(nombre: string, tipo?: string): Album {
  const limpio = nombre.trim().slice(0, 120);
  if (!limpio) throw new Error("el álbum necesita un nombre");
  const existentes = leer();
  if (existentes.some((a) => a.nombre.toLowerCase() === limpio.toLowerCase())) {
    throw new Error("ya existe un álbum con ese nombre");
  }
  const tipoFinal = tipoValido(tipo ?? "");
  const album: Album = {
    id: `al-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    nombre: limpio,
    ...(tipoFinal ? { tipo: tipoFinal } : {}),
    creadoISO: new Date().toISOString(),
  };
  escribir([...existentes, album]);
  return album;
}

export function renombrarAlbum(
  id: string,
  nombre: string,
  tipo?: string,
): Album | null {
  const limpio = nombre.trim().slice(0, 120);
  if (!limpio) return null;
  const lista = leer();
  const i = lista.findIndex((a) => a.id === id);
  if (i < 0) return null;
  if (
    lista.some((a, j) => j !== i && a.nombre.toLowerCase() === limpio.toLowerCase())
  ) {
    throw new Error("ya existe un álbum con ese nombre");
  }
  lista[i].nombre = limpio;
  if (tipo !== undefined) {
    const valido = tipoValido(tipo);
    if (valido) lista[i].tipo = valido;
    else delete lista[i].tipo;
  }
  escribir(lista);
  return lista[i];
}

const TIPOS_IMAGEN: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function guardarPortadaAlbum(
  id: string,
  datos: Buffer,
  mime: string,
): Album | null {
  const ext = TIPOS_IMAGEN[mime?.toLowerCase() ?? ""];
  if (!ext) throw new Error("la carátula debe ser JPG, PNG o WebP");
  if (!datos.length) throw new Error("la imagen llegó vacía");
  if (datos.length > 8 * 1024 * 1024) throw new Error("la carátula pasa de 8 MB");

  const lista = leer();
  const i = lista.findIndex((a) => a.id === id);
  if (i < 0) return null;

  fs.mkdirSync(DIR_PORTADAS, { recursive: true });
  if (lista[i].portada) {
    try {
      fs.rmSync(path.join(DIR_PORTADAS, path.basename(lista[i].portada)), {
        force: true,
      });
    } catch {
      /* no había nada que recoger */
    }
  }
  const archivo = `${id}.${ext}`;
  fs.writeFileSync(path.join(DIR_PORTADAS, archivo), datos);
  lista[i].portada = `/api/biblioteca/albumes/portada/${archivo}`;
  escribir(lista);
  return lista[i];
}

export function quitarPortadaAlbum(id: string): Album | null {
  const lista = leer();
  const i = lista.findIndex((a) => a.id === id);
  if (i < 0) return null;
  if (lista[i].portada) {
    try {
      fs.rmSync(path.join(DIR_PORTADAS, path.basename(lista[i].portada)), {
        force: true,
      });
    } catch {
      /* no había nada que recoger */
    }
    delete lista[i].portada;
    escribir(lista);
  }
  return lista[i];
}

export function rutaPortadaAlbum(archivo: string): string | null {
  const base = path.basename(archivo);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|png|webp)$/.test(base)) return null;
  return path.join(DIR_PORTADAS, base);
}

// Fusiona álbumes de un respaldo: los que no existen se agregan tal cual y
// los conocidos se actualizan (el respaldo manda). Devuelve cuántos cambió.
export function fusionarAlbumes(entrantes: Album[]): number {
  const actuales = leer();
  const porId = new Map(actuales.map((a) => [a.id, a]));
  let cambios = 0;

  for (const entrante of entrantes) {
    if (
      !entrante ||
      typeof entrante.id !== "string" ||
      !entrante.id ||
      typeof entrante.nombre !== "string" ||
      !entrante.nombre.trim()
    ) {
      continue;
    }
    const album: Album = {
      id: entrante.id,
      nombre: entrante.nombre.trim().slice(0, 120),
      ...(tipoValido(entrante.tipo ?? "") ? { tipo: entrante.tipo as TipoAlbum } : {}),
      creadoISO:
        typeof entrante.creadoISO === "string" ? entrante.creadoISO : new Date().toISOString(),
      ...(entrante.portada ? { portada: entrante.portada } : {}),
    };
    // La carátula solo cuenta si su archivo existe (vino en el zip o ya estaba).
    if (album.portada) {
      const ruta = rutaPortadaAlbum(album.portada);
      if (!ruta || !fs.existsSync(ruta)) delete album.portada;
    }

    const previo = porId.get(album.id);
    if (!previo) {
      actuales.push(album);
      porId.set(album.id, album);
      cambios++;
    } else if (JSON.stringify(previo) !== JSON.stringify(album)) {
      actuales[actuales.indexOf(previo)] = album;
      cambios++;
    }
  }

  if (cambios) escribir(actuales);
  return cambios;
}

// Borrar el álbum jamás borra canciones: pertenecer a él es solo una etiqueta.
export function eliminarAlbum(id: string): boolean {
  const lista = leer();
  const album = lista.find((a) => a.id === id);
  if (!album) return false;
  if (album.portada) {
    try {
      fs.rmSync(path.join(DIR_PORTADAS, path.basename(album.portada)), {
        force: true,
      });
    } catch {
      /* no había nada que recoger */
    }
  }
  escribir(lista.filter((a) => a.id !== id));
  return true;
}
