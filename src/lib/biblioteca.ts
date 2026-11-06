import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseFile } from "music-metadata";
import { mapaNombresAlbumes } from "./albumes";
import { obtenerToken } from "./programacion";
import type { PistaSenal } from "./programacion";

export const DIR_BIBLIOTECA = path.join(process.cwd(), "media", "biblioteca");
const DIR_PORTADAS = path.join(DIR_BIBLIOTECA, "portadas");
const ARCHIVO_INDICE = path.join(process.cwd(), "media", "biblioteca.json");

export const TAMANO_MAXIMO = 60 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
};

export type CancionBiblioteca = {
  id: string;
  archivo: string;
  titulo: string;
  artista: string;
  album?: string;
  albumId?: string;
  portada?: string;
  duracionSeg: number;
  tamanoBytes: number;
  subidoISO: string;
  activa: boolean;
  huella?: string;
};

function asegurarCarpetas(): void {
  fs.mkdirSync(DIR_PORTADAS, { recursive: true });
}

export function nombreSeguro(archivo: string): string {
  const base = path.basename(archivo);
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(base) ? base : "";
}

export function tipoDe(archivo: string): string {
  const ext = path.extname(archivo).toLowerCase();
  return TIPOS[ext] ?? "application/octet-stream";
}

function extDesdeMime(mime: string): string {
  const mapa: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".m4a",
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
  };
  return mapa[mime?.toLowerCase() ?? ""] ?? "";
}

// Respaldo de datos en Spotify (nunca audio): se exigen ±8 s de duración para no colgarle la carátula a una homónima.
async function buscarPortadaSpotify(
  titulo: string,
  artista: string,
  duracionSeg: number,
): Promise<string | undefined> {
  try {
    if (!process.env.SPOTIFY_CLIENT_ID) return undefined;
    const token = await obtenerToken();
    const params = new URLSearchParams({
      q: `track:${titulo} artist:${artista}`,
      type: "track",
      limit: "5",
      market: "MX",
    });
    const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      tracks?: {
        items?: {
          name?: string;
          artists?: { name?: string }[];
          duration_ms: number;
          album?: { images?: { url: string }[] };
        }[];
      };
    };
    const candidatas = (json.tracks?.items ?? []).filter(
      (t) => t.album?.images?.length,
    );
    if (!candidatas.length) return undefined;
    candidatas.sort(
      (a, b) =>
        Math.abs(a.duration_ms / 1000 - duracionSeg) -
        Math.abs(b.duration_ms / 1000 - duracionSeg),
    );
    const mejor = candidatas[0];
    if (duracionSeg > 0 && Math.abs(mejor.duration_ms / 1000 - duracionSeg) <= 8) {
      return mejor.album?.images?.[0]?.url;
    }
    const nombreExacto = llaveDuplicado(titulo);
    const artistaPrimario = artista.split(",")[0].trim();
    const artistaExacto = llaveDuplicado(artistaPrimario);
    const exactas = candidatas
      .filter(
        (t) =>
          llaveDuplicado(t.name ?? "") === nombreExacto &&
          llaveDuplicado(t.artists?.[0]?.name ?? "") === artistaExacto,
      )
      .sort(
        (a, b) =>
          Math.abs(a.duration_ms / 1000 - duracionSeg) -
          Math.abs(b.duration_ms / 1000 - duracionSeg),
      );
    const elegida = exactas[0];
    if (
      elegida &&
      duracionSeg > 0 &&
      Math.abs(elegida.duration_ms / 1000 - duracionSeg) <= 75
    ) {
      return elegida.album?.images?.[0]?.url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function selloBiblioteca(): number {
  try {
    return fs.statSync(ARCHIVO_INDICE).mtimeMs;
  } catch {
    return 0;
  }
}

export function leerBiblioteca(): CancionBiblioteca[] {
  try {
    const lista = JSON.parse(
      fs.readFileSync(ARCHIVO_INDICE, "utf8"),
    ) as CancionBiblioteca[];
    if (!Array.isArray(lista)) return [];
    return lista.filter((c) => c && c.id && c.archivo);
  } catch {
    return [];
  }
}

export function buscarPorArchivo(archivo: string): CancionBiblioteca | null {
  return leerBiblioteca().find((c) => c.archivo === archivo) ?? null;
}

export function buscarPorId(id: string): CancionBiblioteca | null {
  return leerBiblioteca().find((c) => c.id === id) ?? null;
}

// Cola de escritura: dos subidas a la vez nunca se pisan el índice.
let cola: Promise<unknown> = Promise.resolve();

function enCola<T>(tarea: () => Promise<T> | T): Promise<T> {
  const siguiente = cola.then(tarea, tarea);
  cola = siguiente.catch(() => undefined);
  return siguiente;
}

function escribirIndice(lista: CancionBiblioteca[]): void {
  asegurarCarpetas();
  const temporal = `${ARCHIVO_INDICE}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(lista, null, 2), "utf8");
  fs.renameSync(temporal, ARCHIVO_INDICE);
}

// Escritura directa del índice, para restaurar respaldos.
export function escribirBiblioteca(lista: CancionBiblioteca[]): void {
  escribirIndice(lista.filter((c) => c && c.id && c.archivo));
}

export function huellaDeCancion(cancion: CancionBiblioteca): string | null {
  return huellaDe(cancion);
}

// Nombres de archivos de audio que realmente están en media/biblioteca/.
export function archivosAudioEnDisco(): Set<string> {
  try {
    return new Set(
      fs
        .readdirSync(DIR_BIBLIOTECA)
        .filter((f) => TIPOS[path.extname(f).toLowerCase()]),
    );
  } catch {
    return new Set();
  }
}

export function llaveDuplicado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const huellasCalculadas = new Map<string, string>();

function huellaDe(cancion: CancionBiblioteca): string | null {
  if (cancion.huella) return cancion.huella;
  const enMemoria = huellasCalculadas.get(cancion.id);
  if (enMemoria) return enMemoria;
  try {
    const datos = fs.readFileSync(path.join(DIR_BIBLIOTECA, cancion.archivo));
    const huella = crypto.createHash("sha256").update(datos).digest("hex");
    huellasCalculadas.set(cancion.id, huella);
    return huella;
  } catch {
    return null;
  }
}

function buscarDuplicado(
  lista: CancionBiblioteca[],
  huella: string,
  titulo: string,
  artista: string,
  duracionSeg: number,
): CancionBiblioteca | null {
  const t = llaveDuplicado(titulo);
  const a = llaveDuplicado(artista);
  for (const cancion of lista) {
    if (huella && huellaDe(cancion) === huella) return cancion;
    if (
      t &&
      duracionSeg > 0 &&
      cancion.duracionSeg > 0 &&
      llaveDuplicado(cancion.titulo) === t &&
      llaveDuplicado(cancion.artista) === a &&
      Math.abs(cancion.duracionSeg - duracionSeg) <= 3
    ) {
      return cancion;
    }
  }
  return null;
}

export async function agregarArchivo(
  datos: Buffer,
  nombreOriginal: string,
  mime: string,
): Promise<CancionBiblioteca> {
  return enCola(async () => {
    asegurarCarpetas();

    const ext = (
      path.extname(nombreOriginal) ||
      extDesdeMime(mime) ||
      ".mp3"
    ).toLowerCase();
    if (!TIPOS[ext]) {
      throw new Error("formato no admitido (usa MP3, M4A, FLAC, OGG o WAV)");
    }
    if (!datos.length) throw new Error("el archivo llegó vacío");
    if (datos.length > TAMANO_MAXIMO) {
      throw new Error("el archivo pasa de 60 MB");
    }

    const huella = crypto.createHash("sha256").update(datos).digest("hex");

    const id = `b-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
    const archivo = `${id}${ext}`;
    const ruta = path.join(DIR_BIBLIOTECA, archivo);
    fs.writeFileSync(ruta, datos);

    let titulo = path
      .basename(nombreOriginal, path.extname(nombreOriginal))
      .replace(/_+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    let artista = "";
    let album = "";
    let duracionSeg = 0;
    let portada: string | undefined;

    try {
      const meta = await parseFile(ruta, { duration: true });
      titulo = meta.common.title?.trim() || titulo;
      artista = meta.common.artist?.trim() || meta.common.albumartist?.trim() || "";
      album = meta.common.album?.trim() || "";
      duracionSeg = Math.round(meta.format.duration ?? 0);
      const foto = meta.common.picture?.[0];
      if (foto?.data?.length) {
        const extFoto = foto.format.includes("png") ? "png" : "jpg";
        const nombreFoto = `${id}.${extFoto}`;
        fs.writeFileSync(
          path.join(DIR_PORTADAS, nombreFoto),
          Buffer.from(foto.data),
        );
        portada = `/api/biblioteca/portada/${nombreFoto}`;
      }
    } catch {
      /* sin etiquetas legibles: quedan el nombre del archivo y duración 0 */
    }

    const previa = leerBiblioteca();
    const duplicada = buscarDuplicado(previa, huella, titulo, artista, duracionSeg);
    if (duplicada) {
      try {
        fs.rmSync(ruta, { force: true });
      } catch {
        /* si no se pudo borrar, el índice nunca la conoció */
      }
      throw new Error(
        `ya está en la biblioteca: «${duplicada.titulo}» de ${duplicada.artista}`,
      );
    }

    if (!portada && artista && duracionSeg > 0) {
      portada = await buscarPortadaSpotify(titulo, artista, duracionSeg);
    }

    const cancion: CancionBiblioteca = {
      id,
      archivo,
      titulo: titulo || "Sin título",
      artista: artista || "Artista desconocido",
      album: album || undefined,
      portada,
      duracionSeg,
      tamanoBytes: datos.length,
      subidoISO: new Date().toISOString(),
      activa: true,
      huella,
    };
    let listaFinal = previa;
    if (previa.some((c) => !c.huella)) {
      listaFinal = previa.map((c) => ({
        ...c,
        huella: c.huella ?? huellasCalculadas.get(c.id) ?? c.huella,
      }));
    }
    escribirIndice([...listaFinal, cancion]);
    return cancion;
  });
}

export function editarCancion(
  id: string,
  cambios: {
    titulo?: string;
    artista?: string;
    album?: string;
    albumId?: string | null;
    activa?: boolean;
  },
): CancionBiblioteca | null {
  const lista = leerBiblioteca();
  const i = lista.findIndex((c) => c.id === id);
  if (i < 0) return null;
  if (typeof cambios.titulo === "string" && cambios.titulo.trim()) {
    lista[i].titulo = cambios.titulo.trim().slice(0, 120);
  }
  if (typeof cambios.artista === "string" && cambios.artista.trim()) {
    lista[i].artista = cambios.artista.trim().slice(0, 120);
  }
  if (typeof cambios.album === "string") {
    const limpio = cambios.album.trim().slice(0, 120);
    if (limpio) lista[i].album = limpio;
    else delete lista[i].album;
  }
  if (cambios.albumId !== undefined) {
    if (cambios.albumId) lista[i].albumId = cambios.albumId;
    else delete lista[i].albumId;
  }
  if (typeof cambios.activa === "boolean") {
    lista[i].activa = cambios.activa;
  }
  escribirIndice(lista);
  return lista[i];
}

export function eliminarCancion(id: string): boolean {
  const lista = leerBiblioteca();
  const cancion = lista.find((c) => c.id === id);
  if (!cancion) return false;
  try {
    fs.rmSync(path.join(DIR_BIBLIOTECA, cancion.archivo), { force: true });
  } catch {
    /* el índice se limpia igual */
  }
  if (cancion.portada) {
    try {
      fs.rmSync(path.join(DIR_PORTADAS, path.basename(cancion.portada)), {
        force: true,
      });
    } catch {
      /* nada que borrar */
    }
  }
  escribirIndice(lista.filter((c) => c.id !== id));
  return true;
}

export async function reintentarPortada(
  id: string,
): Promise<CancionBiblioteca | null> {
  const cancion = buscarPorId(id);
  if (!cancion) return null;
  if (cancion.portada?.startsWith("/api/biblioteca/portada/")) return cancion;
  if (cancion.duracionSeg <= 0) return cancion;
  const url = await buscarPortadaSpotify(
    cancion.titulo,
    cancion.artista,
    cancion.duracionSeg,
  );
  if (!url || url === cancion.portada) return cancion;
  return enCola(() => {
    const lista = leerBiblioteca();
    const i = lista.findIndex((c) => c.id === id);
    if (i < 0) return null;
    lista[i].portada = url;
    escribirIndice(lista);
    return lista[i];
  });
}

export function quitarAlbumDeCanciones(albumId: string): number {
  const lista = leerBiblioteca();
  let cambiadas = 0;
  for (const cancion of lista) {
    if (cancion.albumId === albumId) {
      delete cancion.albumId;
      cambiadas++;
    }
  }
  if (cambiadas) escribirIndice(lista);
  return cambiadas;
}

function mulberry32(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semillaDelDia(): number {
  return Math.floor(Date.now() / 86_400_000) ^ 0x9e3779b9;
}

function semillaBiblioteca(lista: CancionBiblioteca[]): number {
  let h = 0;
  for (const c of lista) {
    for (let i = 0; i < c.id.length; i++) {
      h = (Math.imul(h, 31) + c.id.charCodeAt(i)) | 0;
    }
    h = (h + (c.activa ? 7 : 13)) | 0;
  }
  return (semillaDelDia() ^ h) >>> 0;
}

export async function pistasSenalBiblioteca(): Promise<PistaSenal[]> {
  const activas = leerBiblioteca().filter((c) => c.activa && c.duracionSeg > 0);
  const nombresAlbumes = mapaNombresAlbumes();
  const azar = mulberry32(semillaBiblioteca(activas));
  const orden = [...activas];
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden.map((c) => {
    const pista: PistaSenal = {
      id: `biblio:${c.id}`,
      uri: "",
      titulo: c.titulo,
      artista: c.artista,
      album: (c.albumId ? nombresAlbumes[c.albumId] : undefined) ?? c.album ?? "",
      portada: c.portada,
      duracionMs: c.duracionSeg * 1000,
      origen: "biblioteca",
      audioUrl: `/api/biblioteca/audio/${c.archivo}`,
    };
    return pista;
  });
}
