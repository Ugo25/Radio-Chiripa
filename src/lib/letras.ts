import fs from "node:fs";
import path from "node:path";
import { normalizarLetra } from "./letra-formato";
import { buscarPorId, leerBiblioteca } from "./biblioteca";

const ARCHIVO_LETRAS = path.join(process.cwd(), "media", "letras.json");

const UA = "ChiripaRadio/1.0 (festival Chiripa, Mazatlán)";

const VIDA_SIN_LETRA = 24 * 60 * 60 * 1000;

export type EntradaLetra = {
  titulo: string;
  artista: string;
  letra?: string;
  actualizadoISO: string;
  sinLetraISO?: string;
  instrumental?: boolean;
};

export type IndiceLetras = Record<string, EntradaLetra>;

export type ResumenLetras = {
  buscadas: number;
  nuevas: number;
  sinLetra: number;
  conLetra: number;
  instrumentales: number;
  restantes: number;
  total: number;
};

let colaLetras: Promise<unknown> = Promise.resolve();

function enColaLetras<T>(tarea: () => T): Promise<T> {
  const siguiente = colaLetras.then(tarea, tarea);
  colaLetras = siguiente.catch(() => undefined);
  return siguiente;
}

function leerLetras(): IndiceLetras {
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO_LETRAS, "utf8")) as IndiceLetras;
    return datos && typeof datos === "object" ? datos : {};
  } catch {
    return {};
  }
}

function escribirLetras(indice: IndiceLetras): void {
  fs.mkdirSync(path.dirname(ARCHIVO_LETRAS), { recursive: true });
  const temporal = `${ARCHIVO_LETRAS}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(indice, null, 2), "utf8");
  fs.renameSync(temporal, ARCHIVO_LETRAS);
}

export function letraGuardada(id: string): string | null {
  const entrada = leerLetras()[id];
  return entrada?.letra?.trim() ? entrada.letra : null;
}

export function esInstrumental(id: string): boolean {
  return !!leerLetras()[id]?.instrumental;
}

export function registrarLetra(
  id: string,
  titulo: string,
  artista: string,
  letra: string,
): Promise<void> {
  return enColaLetras(() => {
    const actual = leerLetras();
    actual[id] = {
      titulo,
      artista,
      letra,
      actualizadoISO: new Date().toISOString(),
      instrumental: undefined,
    };
    delete actual[id].instrumental;
    escribirLetras(actual);
  });
}

export function registrarInstrumental(
  id: string,
  titulo: string,
  artista: string,
): Promise<void> {
  return enColaLetras(() => {
    const actual = leerLetras();
    // Instrumental manda: cualquier letra guardada (auto o vieja) se borra,
    // así la radio nunca le cuelga una letra a una canción sin letra.
    actual[id] = {
      titulo,
      artista,
      actualizadoISO: new Date().toISOString(),
      instrumental: true,
    };
    escribirLetras(actual);
  });
}

export function registrarSinLetra(
  id: string,
  titulo: string,
  artista: string,
): void {
  void enColaLetras(() => {
    const actual = leerLetras();
    const previa = actual[id];
    const sinLetraISO = new Date().toISOString();
    actual[id] =
      previa?.letra?.trim()
        ? { ...previa, titulo, artista, sinLetraISO }
        : { titulo, artista, sinLetraISO, actualizadoISO: sinLetraISO };
    escribirLetras(actual);
  });
}

export function leerIndiceLetras(): IndiceLetras {
  return leerLetras();
}

// Sustituye el índice completo (respaldos): pasa por la cola para no pisarse.
export function restaurarLetras(indice: IndiceLetras): Promise<void> {
  return enColaLetras(() => {
    escribirLetras(indice);
  });
}

export function borrarLetra(id: string): Promise<void> {
  return enColaLetras(() => {
    const actual = leerLetras();
    if (id in actual) {
      delete actual[id];
      escribirLetras(actual);
    }
  });
}

export function sinLetraReciente(id: string): boolean {
  const entrada = leerLetras()[id];
  if (!entrada?.sinLetraISO) return false;
  const intento = Date.parse(entrada.sinLetraISO);
  return Number.isFinite(intento) && Date.now() - intento < 10 * 60 * 1000;
}

type ResultadoLrclib = {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

function textoDesde(resultado: ResultadoLrclib): string | null {
  const plano = resultado.plainLyrics?.trim();
  const sincronizada = resultado.syncedLyrics?.trim();
  if (!plano && !sincronizada) return null;
  const texto = normalizarLetra(plano || sincronizada!);
  return texto || null;
}

function parecido(a: string, b: string): number {
  const limpia = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const pa = new Set(limpia(a));
  const pb = limpia(b);
  if (pa.size === 0 || pb.length === 0) return 0;
  const comunes = pb.filter((p) => pa.has(p)).length;
  return comunes / Math.max(pa.size, pb.length);
}

async function pedirLrclib(
  ruta: string,
): Promise<ResultadoLrclib | ResultadoLrclib[] | null> {
  try {
    const res = await fetch(`https://lrclib.net${ruta}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ResultadoLrclib | ResultadoLrclib[];
  } catch {
    return null;
  }
}

export type LetraEncontrada =
  | { tipo: "letra"; texto: string }
  | { tipo: "instrumental" };

function esInstrumentalLrclib(r: { instrumental?: boolean }): boolean {
  return r.instrumental === true;
}

// LRCLIB no pide llave (Spotify no reparte letras): get directo y, si falla, search con la coincidencia más parecida por nombre, artista y duración.
export async function buscarLetra(
  titulo: string,
  artista: string,
  duracionMs: number,
): Promise<LetraEncontrada | null> {
  const cruda = artista.split(",")[0].trim();
  const artistaPrimario =
    cruda && !/artista desconocido/i.test(cruda) ? cruda : "";
  const conArtista = (ruta: string) =>
    artistaPrimario
      ? `${ruta}&artist_name=${encodeURIComponent(artistaPrimario)}`
      : ruta;

  const directa = await pedirLrclib(
    conArtista(`/api/get?track_name=${encodeURIComponent(titulo)}`),
  );
  if (directa && !Array.isArray(directa)) {
    if (esInstrumentalLrclib(directa)) return { tipo: "instrumental" };
    const texto = textoDesde(directa);
    if (texto) return { tipo: "letra", texto };
  }

  const busqueda = await pedirLrclib(
    conArtista(`/api/search?track_name=${encodeURIComponent(titulo)}`),
  );
  const lista = Array.isArray(busqueda) ? busqueda : [];
  const mejor = lista
    .filter((r) => textoDesde(r) || esInstrumentalLrclib(r))
    .map((r) => ({
      r,
      puntos:
        parecido(titulo, r.trackName ?? "") +
        parecido(artistaPrimario, r.artistName ?? "") +
        (r.duration && duracionMs > 0
          ? 1 - Math.min(1, Math.abs(r.duration - duracionMs / 1000) / 30)
          : 0),
    }))
    .sort((a, b) => b.puntos - a.puntos)[0];
  if (mejor) {
    if (esInstrumentalLrclib(mejor.r)) return { tipo: "instrumental" };
    const texto = textoDesde(mejor.r);
    if (texto) return { tipo: "letra", texto };
  }

  const libre = await pedirLrclib(
    `/api/search?q=${encodeURIComponent(`${titulo}${artistaPrimario ? ` ${artistaPrimario}` : ""}`)}`,
  );
  const lista2 = Array.isArray(libre) ? libre : [];
  const mejor2 = lista2
    .filter((r) => textoDesde(r) || esInstrumentalLrclib(r))
    .map((r) => ({
      r,
      puntos:
        parecido(titulo, r.trackName ?? "") +
        0.5 * parecido(artistaPrimario, r.artistName ?? ""),
    }))
    .sort((a, b) => b.puntos - a.puntos)[0];
  if (mejor2) {
    if (esInstrumentalLrclib(mejor2.r)) return { tipo: "instrumental" };
    const texto = textoDesde(mejor2.r);
    if (texto) return { tipo: "letra", texto };
  }
  return null;
}

export type ResultadoLetra = "nueva" | "ya" | "sin-letra" | "sin-cancion";

export async function actualizarLetra(
  id: string,
  forzar = false,
): Promise<ResultadoLetra> {
  const cancion = buscarPorId(id);
  if (!cancion) return "sin-cancion";

  const indice = leerLetras();
  const entrada = indice[id];
  if (
    !forzar &&
    entrada?.instrumental &&
    entrada.titulo === cancion.titulo &&
    entrada.artista === cancion.artista
  ) {
    return "ya";
  }
  if (
    !forzar &&
    entrada?.letra?.trim() &&
    entrada.titulo === cancion.titulo &&
    entrada.artista === cancion.artista
  ) {
    return "ya";
  }

  const hallazgo = await buscarLetra(
    cancion.titulo,
    cancion.artista,
    cancion.duracionSeg * 1000,
  );
  const ahora = new Date().toISOString();
  if (!hallazgo) {
    await enColaLetras(() => {
      const actual = leerLetras();
      actual[id] = {
        ...(actual[id] ?? { titulo: cancion.titulo, artista: cancion.artista }),
        titulo: cancion.titulo,
        artista: cancion.artista,
        sinLetraISO: ahora,
      };
      escribirLetras(actual);
    });
    return "sin-letra";
  }
  if (hallazgo.tipo === "instrumental") {
    await enColaLetras(() => {
      const actual = leerLetras();
      actual[id] = {
        titulo: cancion.titulo,
        artista: cancion.artista,
        actualizadoISO: ahora,
        instrumental: true,
      };
      escribirLetras(actual);
    });
    return "nueva";
  }
  await enColaLetras(() => {
    const actual = leerLetras();
    actual[id] = {
      titulo: cancion.titulo,
      artista: cancion.artista,
      letra: hallazgo.texto,
      actualizadoISO: ahora,
    };
    escribirLetras(actual);
  });
  return "nueva";
}

export async function actualizarLetrasFaltantes(
  presupuestoMs = 45_000,
): Promise<ResumenLetras> {
  const lista = leerBiblioteca();
  const resumen: ResumenLetras = {
    buscadas: 0,
    nuevas: 0,
    sinLetra: 0,
    conLetra: 0,
    instrumentales: 0,
    restantes: 0,
    total: lista.length,
  };
  const inicio = Date.now();
  const indiceInicial = leerLetras();

  for (const cancion of lista) {
    const entrada = indiceInicial[cancion.id];
    const letraAlDia =
      entrada?.letra?.trim() &&
      entrada.titulo === cancion.titulo &&
      entrada.artista === cancion.artista;
    const instrumentalAlDia =
      entrada?.instrumental &&
      entrada.titulo === cancion.titulo &&
      entrada.artista === cancion.artista;
    if (letraAlDia || instrumentalAlDia) {
      resumen.conLetra++;
      if (instrumentalAlDia && !letraAlDia) resumen.instrumentales++;
      continue;
    }
    const falloReciente =
      entrada?.sinLetraISO &&
      Date.now() - new Date(entrada.sinLetraISO).getTime() < VIDA_SIN_LETRA &&
      entrada.titulo === cancion.titulo &&
      entrada.artista === cancion.artista;
    if (falloReciente) {
      resumen.sinLetra++;
      continue;
    }
    if (Date.now() - inicio > presupuestoMs) {
      resumen.restantes++;
      continue;
    }

    const resultado = await actualizarLetra(cancion.id);
    resumen.buscadas++;
    if (resultado === "nueva") resumen.nuevas++;
    else if (resultado === "sin-letra") resumen.sinLetra++;
    else if (resultado === "ya") resumen.conLetra++;
  }
  return resumen;
}
