import fs from "node:fs";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  DIR_BIBLIOTECA,
  archivosAudioEnDisco,
  escribirBiblioteca,
  huellaDeCancion,
  leerBiblioteca,
  llaveDuplicado,
  nombreSeguro,
  type CancionBiblioteca,
} from "./biblioteca";
import {
  leerIndiceLetras,
  restaurarLetras,
  type EntradaLetra,
  type IndiceLetras,
} from "./letras";
import { fusionarAlbumes, type Album } from "./albumes";
import { DIR_FOTOS_CUENTAS, recuperarCuentas } from "./cuentas";
import {
  escribirEstadoRadio,
  horaValida,
  leerEstadoRadio,
  type EstadoRadio,
} from "./estado-radio";
import { fusionarHistorial, puntosOyentes, type PuntoOyentes } from "./oyentes";
import { escribirRedes, leerRedes } from "./redes";
import type { Red } from "./redes-compartir";
import { invalidarSenalMemo } from "./senal-extendida";

/**
 * Respaldo completo de la radio en un ZIP: índice, letras (incluidas las
 * pegadas a mano), álbumes, cuentas, silencio nocturno, audiencia, imágenes
 * y las letras en .txt legibles. El audio no va: eso se respalda copiando
 * media/biblioteca/.
 *
 * La importación empareja por huella digital del archivo, de modo que si las
 * canciones se volvieron a subir desde cero (ids nuevos), letras y metadatos
 * se re-enchanchan solos.
 */

export const FORMATO_RESPALDO = 1;
const TAMANO_IMAGEN_MAX = 8 * 1024 * 1024;

const DIR_PORTADAS = path.join(DIR_BIBLIOTECA, "portadas");
const DIR_CARATULAS = path.join(DIR_BIBLIOTECA, "caratulas-albumes");
const ARCHIVO_CUENTAS = path.join(process.cwd(), "media", "cuentas.json");
const ARCHIVO_CONFIG = path.join(process.cwd(), "media", "config.json");

export type InformeRespaldo = {
  cancionesRestauradas: number;
  cancionesSinAudio: number;
  metadatosAplicados: number;
  letrasVinculadas: number;
  letrasYaEstaban: number;
  albumesRestaurados: number;
  cuentasRecuperadas: number;
  silencioNocturnoRestaurado: boolean;
  historialFusionado: boolean;
  imagenesEscritas: number;
  aviso: string;
};

type EntradasRespaldo = {
  biblio: CancionBiblioteca[];
  letras: IndiceLetras | null;
  albumes: Album[] | null;
  cuentas: unknown[] | null;
  estado: EstadoRadio | null;
  oyentes: PuntoOyentes[] | null;
  redes: Red[] | null;
  archivos: Map<string, Buffer>;
};

function leerJsonDisco(ruta: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}

function listaSegura(carpeta: string): string[] {
  try {
    return fs
      .readdirSync(carpeta)
      .map((f) => nombreSeguro(f))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function limpiarNombreTxt(texto: string): string {
  return texto
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function textoLeeme(canciones: number, letras: number): string {
  return [
    "RESPALDO COMPLETO — CHIRIPA RADIO",
    `Canciones: ${canciones} · letras guardadas: ${letras}`,
    "",
    "Qué trae este ZIP:",
    "· biblioteca.json   Índice: título, artista, álbum, portada, duración, activa",
    "· letras.json       TODAS las letras (también las pegadas a mano) e instrumentales",
    "· letras-txt/       Las mismas letras, un .txt legible por canción",
    "· albumes.json      Álbumes del panel (con caratulas-albumes/ si usan imagen)",
    "· cuentas.json      Cuentas del panel — traen el hash de las contraseñas: guarda bien este archivo",
    "· estado-radio.json Silencio nocturno programado",
    "· oyentes.json      Historial de audiencia (24 h)",
    "· redes.json        Redes sociales de la radio (si están configuradas)",
    "· config.json       Hash del PIN maestro (solo si lo cambiaste desde el panel)",
    "· portadas/, fotos-cuentas/  Imágenes de la biblioteca y del panel",
    "",
    "Qué NO trae: el audio. Las canciones viven en media/biblioteca/ del servidor;",
    "respaldarlas es copiar esa carpeta.",
    "",
    "Cómo restaurar:",
    "1. Entra al panel → Configuración → Datos → «Importar respaldo» y elige este ZIP",
    "   (también acepta el JSON de la biblioteca).",
    "2. Si además se perdió la carpeta media/, devuelve primero tu copia del audio",
    "   a media/biblioteca/ y después importa este ZIP: todo vuelve a su lugar.",
    "",
    "La importación empareja por huella digital del archivo: si re-subiste las",
    "canciones desde cero, letras, álbumes y metadatos se re-attach solos.",
    "El PIN maestro y las sesiones abiertas no se tocan al importar.",
  ].join("\n");
}

export async function construirRespaldo(): Promise<Uint8Array> {
  const canciones = leerBiblioteca();
  const letras = leerIndiceLetras();
  const albumes = leerAlbumesOrdenados();
  const cuentas = (leerJsonDisco(ARCHIVO_CUENTAS) as unknown[]) ?? [];
  const estado = leerEstadoRadio();
  const config = leerJsonDisco(ARCHIVO_CONFIG);

  const entradas: Record<string, Uint8Array> = {
    "respaldo.json": strToU8(
      JSON.stringify(
        {
          formato: FORMATO_RESPALDO,
          creadoISO: new Date().toISOString(),
          canciones: canciones.length,
          letras: Object.keys(letras).length,
          albumes: albumes.length,
        },
        null,
        2,
      ),
    ),
    "biblioteca.json": strToU8(JSON.stringify(canciones, null, 2)),
    "letras.json": strToU8(JSON.stringify(letras, null, 2)),
    "albumes.json": strToU8(JSON.stringify(albumes, null, 2)),
    "cuentas.json": strToU8(JSON.stringify(cuentas, null, 2)),
    "estado-radio.json": strToU8(JSON.stringify(estado, null, 2)),
    "oyentes.json": strToU8(JSON.stringify({ puntos: puntosOyentes() }, null, 2)),
    "LEEME.txt": strToU8(
      textoLeeme(canciones.length, Object.keys(letras).length),
    ),
  };
  if (config) entradas["config.json"] = strToU8(JSON.stringify(config, null, 2));

  const redes = leerRedes();
  if (redes.length) {
    entradas["redes.json"] = strToU8(JSON.stringify({ redes }, null, 2));
  }

  for (const archivo of listaSegura(DIR_PORTADAS)) {
    entradas[`portadas/${archivo}`] = new Uint8Array(
      fs.readFileSync(path.join(DIR_PORTADAS, archivo)),
    );
  }
  for (const archivo of listaSegura(DIR_CARATULAS)) {
    entradas[`caratulas-albumes/${archivo}`] = new Uint8Array(
      fs.readFileSync(path.join(DIR_CARATULAS, archivo)),
    );
  }
  for (const archivo of listaSegura(DIR_FOTOS_CUENTAS)) {
    entradas[`fotos-cuentas/${archivo}`] = new Uint8Array(
      fs.readFileSync(path.join(DIR_FOTOS_CUENTAS, archivo)),
    );
  }

  // Las letras también en texto plano, una por canción, para leerlas a mano.
  const usados = new Set<string>();
  for (const entrada of Object.values(letras)) {
    const instrumental = entrada.instrumental === true;
    if (!entrada.letra?.trim() && !instrumental) continue;
    let base = `${limpiarNombreTxt(entrada.artista) || "Artista desconocido"} — ${limpiarNombreTxt(entrada.titulo) || "Sin título"}`;
    if (base.length > 90) base = base.slice(0, 90).trim();
    let nombre = instrumental ? `${base} (instrumental).txt` : `${base}.txt`;
    for (let i = 2; usados.has(nombre); i++) nombre = `${base} (${i}).txt`;
    usados.add(nombre);
    const contenido = instrumental
      ? `${entrada.titulo}\n${entrada.artista}\n\n— Instrumental —\n`
      : `${entrada.titulo}\n${entrada.artista}\n\n${entrada.letra!.trim()}\n`;
    entradas[`letras-txt/${nombre}`] = strToU8(contenido);
  }

  return zipSync(entradas, { level: 6, mtime: new Date() });
}

function leerAlbumesOrdenados(): Album[] {
  const crudos = (leerJsonDisco(path.join(process.cwd(), "media", "albumes.json")) as Album[]) ?? [];
  return Array.isArray(crudos) ? crudos.filter((a) => a && a.id && a.nombre) : [];
}

function pistaDesdeRespaldada(crudo: unknown): CancionBiblioteca | null {
  if (!crudo || typeof crudo !== "object") return null;
  const c = crudo as Partial<CancionBiblioteca>;
  if (typeof c.id !== "string" || !c.id || typeof c.archivo !== "string" || !c.archivo) {
    return null;
  }
  return {
    id: c.id,
    archivo: c.archivo,
    titulo: typeof c.titulo === "string" && c.titulo ? c.titulo : "Sin título",
    artista: typeof c.artista === "string" && c.artista ? c.artista : "Artista desconocido",
    ...(typeof c.album === "string" && c.album ? { album: c.album } : {}),
    ...(typeof c.albumId === "string" && c.albumId ? { albumId: c.albumId } : {}),
    ...(typeof c.portada === "string" && c.portada ? { portada: c.portada } : {}),
    duracionSeg: Number(c.duracionSeg) || 0,
    tamanoBytes: Number(c.tamanoBytes) || 0,
    subidoISO: typeof c.subidoISO === "string" ? c.subidoISO : new Date().toISOString(),
    activa: c.activa !== false,
    ...(typeof c.huella === "string" && c.huella ? { huella: c.huella } : {}),
  };
}

function validarBiblio(crudo: unknown): CancionBiblioteca[] {
  return Array.isArray(crudo) ? crudo.map(pistaDesdeRespaldada).filter((c): c is CancionBiblioteca => !!c) : [];
}

function pareceIndiceLetras(crudo: unknown): crudo is IndiceLetras {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return false;
  const valores = Object.values(crudo as Record<string, unknown>);
  if (!valores.length) return false;
  return valores.every(
    (v) =>
      !!v &&
      typeof v === "object" &&
      typeof (v as EntradaLetra).titulo === "string" &&
      typeof (v as EntradaLetra).artista === "string",
  );
}

function esEstadoRadio(crudo: unknown): crudo is EstadoRadio {
  return (
    !!crudo &&
    typeof crudo === "object" &&
    !!(crudo as EstadoRadio).nocturno &&
    typeof (crudo as EstadoRadio).nocturno === "object"
  );
}

export function leerRespaldo(datos: Buffer, nombre: string): EntradasRespaldo {
  const esZip =
    nombre.toLowerCase().endsWith(".zip") ||
    (datos.length > 4 && datos[0] === 0x50 && datos[1] === 0x4b);

  if (esZip) {
    const descomprimido = unzipSync(new Uint8Array(datos));
    const archivos = new Map<string, Buffer>();
    for (const [ruta, contenido] of Object.entries(descomprimido)) {
      if (ruta.endsWith("/")) continue;
      archivos.set(ruta, Buffer.from(contenido));
    }
    const json = (clave: string): unknown => {
      const bytes = archivos.get(clave);
      if (!bytes) return null;
      try {
        return JSON.parse(strFromU8(new Uint8Array(bytes)));
      } catch {
        return null;
      }
    };
    const oyentes = json("oyentes.json") as { puntos?: PuntoOyentes[] } | null;
    const redesCrudas = json("redes.json") as { redes?: Red[] } | null;
    const letrasCrudas = json("letras.json");
    const estadoCrudo = json("estado-radio.json");
    return {
      biblio: validarBiblio(json("biblioteca.json")),
      letras: pareceIndiceLetras(letrasCrudas) ? letrasCrudas : null,
      albumes: Array.isArray(json("albumes.json")) ? (json("albumes.json") as Album[]) : null,
      cuentas: Array.isArray(json("cuentas.json")) ? (json("cuentas.json") as unknown[]) : null,
      estado: esEstadoRadio(estadoCrudo) ? estadoCrudo : null,
      oyentes: Array.isArray(oyentes?.puntos) ? oyentes.puntos : null,
      redes: Array.isArray(redesCrudas?.redes) ? redesCrudas.redes : null,
      archivos,
    };
  }

  const parseado = JSON.parse(strFromU8(new Uint8Array(datos)));
  if (Array.isArray(parseado)) {
    return { biblio: validarBiblio(parseado), letras: null, albumes: null, cuentas: null, estado: null, oyentes: null, redes: null, archivos: new Map() };
  }
  if (parseado && typeof parseado === "object") {
    const objeto = parseado as Record<string, unknown>;
    const biblio = validarBiblio(objeto.canciones ?? objeto.biblioteca);
    const letrasCrudo = objeto.letras;
    const oyentes = objeto.oyentes as { puntos?: PuntoOyentes[] } | undefined;
    const redesCrudo = (objeto["redes.json"] ?? objeto.redes) as { redes?: Red[] } | Red[] | undefined;
    return {
      biblio,
      letras: pareceIndiceLetras(letrasCrudo) ? letrasCrudo : null,
      albumes: Array.isArray(objeto.albumes) ? (objeto.albumes as Album[]) : null,
      cuentas: Array.isArray(objeto.cuentas) ? (objeto.cuentas as unknown[]) : null,
      estado: esEstadoRadio(objeto["estado-radio"] ?? objeto.estado) ? (objeto["estado-radio"] ?? objeto.estado) as EstadoRadio : null,
      oyentes: oyentes && Array.isArray(oyentes.puntos) ? oyentes.puntos : null,
      redes: Array.isArray(redesCrudo)
        ? (redesCrudo as Red[])
        : Array.isArray((redesCrudo as { redes?: Red[] })?.redes)
          ? (redesCrudo as { redes: Red[] }).redes
          : null,
      archivos: new Map(),
    };
  }
  throw new Error("No reconozco ese archivo como respaldo (se espera ZIP o JSON).");
}

function extraerImagenes(
  archivos: Map<string, Buffer>,
  prefijo: string,
  carpeta: string,
): number {
  let escritas = 0;
  for (const [ruta, contenido] of archivos) {
    if (!ruta.startsWith(`${prefijo}/`)) continue;
    const base = nombreSeguro(ruta.slice(prefijo.length + 1));
    if (!base || !contenido.length || contenido.length > TAMANO_IMAGEN_MAX) continue;
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, base), contenido);
    escritas++;
  }
  return escritas;
}

export async function aplicarRespaldo(r: EntradasRespaldo): Promise<InformeRespaldo> {
  if (!r.biblio.length && !r.letras) {
    throw new Error("El respaldo no trae la biblioteca.");
  }

  const informe: InformeRespaldo = {
    cancionesRestauradas: 0,
    cancionesSinAudio: 0,
    metadatosAplicados: 0,
    letrasVinculadas: 0,
    letrasYaEstaban: 0,
    albumesRestaurados: 0,
    cuentasRecuperadas: 0,
    silencioNocturnoRestaurado: false,
    historialFusionado: false,
    imagenesEscritas: 0,
    aviso: "",
  };

  // 1) Imágenes del zip a su sitio (antes que álbumes e índice, que las revisan).
  informe.imagenesEscritas =
    extraerImagenes(r.archivos, "portadas", DIR_PORTADAS) +
    extraerImagenes(r.archivos, "caratulas-albumes", DIR_CARATULAS) +
    extraerImagenes(r.archivos, "fotos-cuentas", DIR_FOTOS_CUENTAS);

  // 2) Álbumes del respaldo (necesarios antes de re-etiquetar canciones).
  if (r.albumes) informe.albumesRestaurados = fusionarAlbumes(r.albumes);

  const actuales = leerBiblioteca();
  const enDisco = archivosAudioEnDisco();

  // 3) Devolver al índice las canciones cuyo audio sigue en disco.
  const idsActuales = new Set(actuales.map((c) => c.id));
  const restauradas: CancionBiblioteca[] = [];
  for (const b of r.biblio) {
    if (idsActuales.has(b.id)) continue;
    if (!enDisco.has(b.archivo)) {
      informe.cancionesSinAudio++;
      continue;
    }
    const copia = { ...b };
    if (copia.portada?.startsWith("/api/")) {
      const base = path.basename(copia.portada);
      if (!fs.existsSync(path.join(DIR_PORTADAS, base))) delete copia.portada;
    }
    restauradas.push(copia);
    idsActuales.add(copia.id);
  }
  informe.cancionesRestauradas = restauradas.length;

  const lista = [...actuales, ...restauradas];

  // 4) Re-enchonchar metadatos: canciones re-subidas desde cero (id nuevo,
  //    huella igual) recuperan título, artista, álbum, portada y estado.
  const porHuella = new Map<string, CancionBiblioteca>();
  const porNombre = new Map<string, CancionBiblioteca>();
  for (const b of r.biblio) {
    if (b.huella) porHuella.set(b.huella, b);
    porNombre.set(`${llaveDuplicado(b.titulo)}|${llaveDuplicado(b.artista)}|${b.duracionSeg}`, b);
  }
  const idsAlbumes = new Set((r.albumes ?? []).map((a) => a.id));

  for (const cancion of lista) {
    const nombre = `${llaveDuplicado(cancion.titulo)}|${llaveDuplicado(cancion.artista)}|${cancion.duracionSeg}`;
    const huella = cancion.huella ?? huellaDeCancion(cancion);
    const b = (huella && porHuella.get(huella)) || porNombre.get(nombre);
    if (!b || b.id === cancion.id) continue;

    let cambio = false;
    if (b.titulo && b.titulo !== cancion.titulo) {
      cancion.titulo = b.titulo;
      cambio = true;
    }
    if (b.artista && b.artista !== cancion.artista) {
      cancion.artista = b.artista;
      cambio = true;
    }
    if (b.album && b.album !== cancion.album) {
      cancion.album = b.album;
      cambio = true;
    }
    if (b.albumId && idsAlbumes.has(b.albumId) && cancion.albumId !== b.albumId) {
      cancion.albumId = b.albumId;
      cambio = true;
    }
    if (typeof b.activa === "boolean" && b.activa !== cancion.activa) {
      cancion.activa = b.activa;
      cambio = true;
    }
    if (b.portada && b.portada !== cancion.portada) {
      const local = path.basename(b.portada);
      if (
        b.portada.startsWith("http") ||
        fs.existsSync(path.join(DIR_PORTADAS, local))
      ) {
        cancion.portada = b.portada;
        cambio = true;
      }
    }
    if (cambio) informe.metadatosAplicados++;
  }

  // 5) Letras: el id del respaldo se re-encuentra por id, huella o nombre+duración.
  if (r.letras) {
    const porIdRespaldo = new Map(r.biblio.map((b) => [b.id, b]));
    const final: IndiceLetras = { ...leerIndiceLetras() };

    for (const [idViejo, entrada] of Object.entries(r.letras)) {
      const tieneLetra = !!entrada.letra?.trim();
      const instrumental = entrada.instrumental === true;
      if (!tieneLetra && !instrumental) continue;

      const b = porIdRespaldo.get(idViejo);
      const destino =
        lista.find((c) => c.id === idViejo) ??
        (b?.huella
          ? lista.find((c) => (c.huella ?? huellaDeCancion(c)) === b.huella)
          : undefined) ??
        (b
          ? lista.find(
              (c) =>
                llaveDuplicado(c.titulo) === llaveDuplicado(b.titulo) &&
                llaveDuplicado(c.artista) === llaveDuplicado(b.artista) &&
                c.duracionSeg > 0 &&
                b.duracionSeg > 0 &&
                Math.abs(c.duracionSeg - b.duracionSeg) <= 3,
            )
          : undefined);
      if (!destino) continue;

      const previa = final[destino.id];
      if (previa?.letra === entrada.letra && !!previa?.instrumental === instrumental) {
        informe.letrasYaEstaban++;
        continue;
      }
      final[destino.id] = {
        titulo: destino.titulo,
        artista: destino.artista,
        ...(tieneLetra ? { letra: entrada.letra } : {}),
        actualizadoISO: entrada.actualizadoISO ?? new Date().toISOString(),
        ...(instrumental ? { instrumental: true } : {}),
      };
      informe.letrasVinculadas++;
    }
    await restaurarLetras(final);
  }

  // 6) Cuentas perdidas (solo agrega; las actuales y las sesiones quedan).
  if (r.cuentas) informe.cuentasRecuperadas = recuperarCuentas(r.cuentas);

  // 7) Silencio nocturno del respaldo; la emergencia en curso no se toca.
  if (r.estado?.nocturno) {
    const actual = leerEstadoRadio();
    escribirEstadoRadio({
      emergencia: actual.emergencia,
      nocturno: {
        activo: r.estado.nocturno.activo === true,
        desde: horaValida(r.estado.nocturno.desde) ? r.estado.nocturno.desde : actual.nocturno.desde,
        hasta: horaValida(r.estado.nocturno.hasta) ? r.estado.nocturno.hasta : actual.nocturno.hasta,
      },
    });
    informe.silencioNocturnoRestaurado = true;
  }

  // 8) Audiencia: fusionar por marca de tiempo.
  if (r.oyentes) informe.historialFusionado = fusionarHistorial(r.oyentes);

  // 9) Redes sociales del reproductor (lista corta; si el respaldo no trae, nada cambia).
  if (r.redes) escribirRedes(r.redes);

  // 10) Índice final y señal nueva.
  escribirBiblioteca(lista);
  invalidarSenalMemo();

  const partes: string[] = [];
  if (informe.cancionesRestauradas) partes.push(`${informe.cancionesRestauradas} canciones de vuelta al índice`);
  if (informe.metadatosAplicados) partes.push(`${informe.metadatosAplicados} canciones con datos recuperados`);
  if (informe.letrasVinculadas) partes.push(`${informe.letrasVinculadas} letras vinculadas`);
  if (informe.letrasYaEstaban) partes.push(`${informe.letrasYaEstaban} letras que ya estaban al día`);
  if (informe.albumesRestaurados) partes.push(`${informe.albumesRestaurados} álbumes`);
  if (informe.cuentasRecuperadas) partes.push(`${informe.cuentasRecuperadas} cuentas`);
  if (informe.imagenesEscritas) partes.push(`${informe.imagenesEscritas} imágenes`);
  if (informe.silencioNocturnoRestaurado) partes.push("silencio nocturno restaurado");
  if (informe.historialFusionado) partes.push("historial de oyentes fusionado");
  if (informe.cancionesSinAudio) partes.push(`${informe.cancionesSinAudio} canciones del respaldo sin audio en disco (se omitieron)`);
  informe.aviso = partes.length
    ? `Respaldo aplicado: ${partes.join(", ")}.`
    : "Respaldo revisado: todo ya estaba en su lugar.";
  return informe;
}
