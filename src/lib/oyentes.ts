import fs from "node:fs";
import path from "node:path";

/**
 * Oyentes de la radio: latidos en memoria + un historial ligero en disco.
 *
 * El reproductor público late cada 20 s con su id de cliente; mientras el
 * latido viva (70 s) la persona cuenta como oyente. Cada 5 minutos se deja
 * una muestra del conteo en media/oyentes.json y se recorta a 24 h, de modo
 * que el panel pueda dibujar la audiencia del día sin base de datos.
 */

export type PuntoOyentes = { t: number; n: number };

const ARCHIVO = path.join(process.cwd(), "media", "oyentes.json");
const VIDA_LATIDO = 70_000;
const PASO_MS = 5 * 60 * 1000;
const RETENCION_MS = 24 * 60 * 60 * 1000;
/* Si nadie deja muestra en 30 min (nadie late), el valor conocido ya no
   representa a nadie: los huecos largos se pintan como cero. */
const VENCIMIENTO_CARRY = 6 * PASO_MS;

const latidos = new Map<string, number>();
let muestras: PuntoOyentes[] | null = null;
let escribiendo = false;

function leerMuestras(): PuntoOyentes[] {
  if (muestras) return muestras;
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO, "utf8")) as {
      puntos?: PuntoOyentes[];
    };
    muestras = Array.isArray(datos.puntos)
      ? datos.puntos.filter(
          (p) => p && typeof p.t === "number" && typeof p.n === "number",
        )
      : [];
  } catch {
    muestras = [];
  }
  return muestras;
}

function escribirMuestras(): void {
  if (escribiendo || !muestras) return;
  escribiendo = true;
  try {
    fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
    const temporal = `${ARCHIVO}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify({ puntos: muestras }), "utf8");
    fs.renameSync(temporal, ARCHIVO);
  } catch {
    /* sin disco: la historia sigue viva en memoria mientras viva el proceso */
  } finally {
    escribiendo = false;
  }
}

/** Copia cruda de las muestras guardadas (para el respaldo). */
export function puntosOyentes(): PuntoOyentes[] {
  return [...leerMuestras()];
}

/** Fusiona muestras de un respaldo con las actuales (por marca de tiempo). */
export function fusionarHistorial(entrantes: PuntoOyentes[]): boolean {
  const actuales = leerMuestras();
  const porT = new Map(actuales.map((p) => [p.t, p]));
  let nuevos = 0;
  for (const p of entrantes) {
    if (!p || typeof p.t !== "number" || typeof p.n !== "number") continue;
    if (!porT.has(p.t)) {
      porT.set(p.t, { t: p.t, n: p.n });
      nuevos++;
    }
  }
  if (!nuevos) return false;
  muestras = [...porT.values()].sort((a, b) => a.t - b.t);
  const vencimiento = Date.now() - RETENCION_MS;
  while (muestras.length && muestras[0].t < vencimiento) muestras.shift();
  escribirMuestras();
  return true;
}

/** Registra el latido de un cliente y devuelve cuántos oyentes hay ahora. */
export function contarOyentes(id: string, ahora = Date.now()): number {
  for (const [clave, cuando] of latidos) {
    if (ahora - cuando > VIDA_LATIDO) latidos.delete(clave);
  }
  if (id) latidos.set(id, ahora);
  const n = latidos.size;

  const lista = leerMuestras();
  const paso = Math.floor(ahora / PASO_MS);
  const t = paso * PASO_MS;
  const ultima = lista[lista.length - 1];
  if (ultima && ultima.t === t) {
    // Varios latidos en el mismo tramo: queda el punto más alto.
    ultima.n = Math.max(ultima.n, n);
  } else {
    lista.push({ t, n });
    const vencimiento = ahora - RETENCION_MS;
    while (lista.length && lista[0].t < vencimiento) lista.shift();
    escribirMuestras();
  }
  return n;
}

/** Serie de 24 h en pasos de 5 min, con pico y promedio del día. */
export function historialOyentes(
  ahora = Date.now(),
): { puntos: PuntoOyentes[]; pico: number; promedio: number } {
  const crudas = leerMuestras().filter((p) => p.t >= ahora - RETENCION_MS);
  const puntos: PuntoOyentes[] = [];
  const pasoInicial = Math.floor((ahora - RETENCION_MS) / PASO_MS);
  const pasoFinal = Math.floor(ahora / PASO_MS);
  let i = 0;
  let valor = 0;
  let ultimaMuestra = -Infinity;
  for (let paso = pasoInicial; paso <= pasoFinal; paso++) {
    const t = paso * PASO_MS;
    while (i < crudas.length && crudas[i].t <= t) {
      valor = crudas[i].n;
      ultimaMuestra = crudas[i].t;
      i++;
    }
    if (t - ultimaMuestra > VENCIMIENTO_CARRY) valor = 0;
    puntos.push({ t, n: valor });
  }
  const pico = puntos.reduce((max, p) => Math.max(max, p.n), 0);
  const promedio = puntos.length
    ? Math.round((puntos.reduce((s, p) => s + p.n, 0) / puntos.length) * 10) / 10
    : 0;
  return { puntos, pico, promedio };
}
