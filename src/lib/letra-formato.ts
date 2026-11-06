
export function sinMarcasDeTiempo(linea: string): string {
  return linea.replace(
    /^(\s*\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/,
    "",
  );
}

const METADATO_LRC =
  /^\s*\[(?:ti|ar|al|by|au|re|ve|tool|length|offset|encoding|kr|orig)\s*:.*\]\s*$/i;

const SECCION_PLANA =
  /^[\(\[]?\s*(?:verso|estrofa|coro|pre-?\s?coro|post-?\s?coro|precoro|puente|intro|outro|interludio|instrumental|estribillo|hook|verse|chorus|pre-?\s?chorus|post-?\s?chorus|bridge|refrain|(?:guitar|piano|bass|sax)\s+solo|solo\s+de\s+(?:guitarra|piano|bater[ií]a|teclas|bajo))(?:\s+(?:\d+|[ivxl]{1,6}))?\s*[:.]?\s*[\)\]]?$/i;

const REPETICION = /^[\(\[]?\s*(?:x\s*\d+|\d+\s*x|bis)\s*[\)\]]?$/i;

const REPETICION_FINAL = /\s*[\(\[]\s*(?:x\s*\d+|\d+\s*x|bis)\s*[\)\]]\s*$/i;

const RESTOS_PLANTILLA = [
  "escribe aquí la letra",
  "un verso por línea",
  "las líneas vacías separan",
  "esto es un ejemplo",
  "no lo escribas aquí",
  "las marcas de tiempo se quitan",
  "si tu archivo es .lrc",
  "usa el interruptor",
  "plantilla-letra-chiripa",
];

function limpiarLinea(linea: string): string | null {
  const sinTiempo = sinMarcasDeTiempo(linea);
  const plano = sinTiempo.trim();
  if (!plano) return "";
  if (METADATO_LRC.test(linea)) return null;
  const bajo = plano.toLowerCase();
  if (RESTOS_PLANTILLA.some((resto) => bajo.includes(resto))) return null;
  const suelto = plano.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!suelto) return null;
  if (SECCION_PLANA.test(suelto.replace(/[\(\[\]\)]/g, " ").replace(/\s+/g, " ").trim()))
    return null;
  if (REPETICION.test(suelto)) return null;
  return sinTiempo.replace(REPETICION_FINAL, "").replace(/\s+$/g, "");
}

// El molde: quita marcas de tiempo y metadatos .lrc, secciones ([Coro], [Verso 1]…), el título entre corchetes y repeticiones ((x2), bis). Lo guardado queda pelado, igual que las letras de LRCLIB.
export function normalizarLetra(texto: string): string {
  return texto
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((linea) => limpiarLinea(linea))
    .filter((linea) => linea !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HUELLAS_PLANTILLA = [
  "escribe aquí la letra",
  "no lo escribas aquí",
  "las líneas vacías separan",
  "esto es un ejemplo",
];

export function parecePlantillaSinRellenar(texto: string): boolean {
  const plano = texto.toLowerCase();
  const encontradas = HUELLAS_PLANTILLA.filter((h) => plano.includes(h)).length;
  return encontradas >= 2;
}
