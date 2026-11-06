import { pistasSenalBiblioteca, selloBiblioteca } from "./biblioteca";
import { estadoSilencio } from "./estado-radio";
import { pistaAlAire, type PistaAire, type PistaSenal } from "./programacion";

import fs from "node:fs";
import path from "node:path";

export type SenalExtendida = {
  pistas: PistaSenal[];
  biblioteca: number;
  origen: number;
};

type EstadoAire = {
  origen: number;
  sello: number;
  pistas: { id: string; duracionMs: number }[];
};

const ARCHIVO_AIRE = path.join(process.cwd(), "media", "aire.json");

let memo: { senal: SenalExtendida; expira: number; sello: number } | null = null;
const VIDA_MEMO_MS = 5 * 60 * 1000;

function leerAire(): EstadoAire | null {
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO_AIRE, "utf8")) as EstadoAire;
    return datos && Array.isArray(datos.pistas) && datos.origen > 0 ? datos : null;
  } catch {
    return null;
  }
}

function escribirAire(estado: EstadoAire): void {
  try {
    fs.mkdirSync(path.dirname(ARCHIVO_AIRE), { recursive: true });
    const temporal = `${ARCHIVO_AIRE}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(estado, null, 2), "utf8");
    fs.renameSync(temporal, ARCHIVO_AIRE);
  } catch {
    /* sin estado en disco el ancla se recalcula; la señal sigue al aire */
  }
}

// La huella cambia solo si cambian las pistas (no si se edita un título).
function huellaPistas(pistas: PistaAire[]): string {
  return pistas.map((p) => `${p.id}:${p.duracionMs}`).join("|");
}

export async function obtenerSenalExtendida(): Promise<SenalExtendida> {
  // Silencio activo: señal vacía sin tocar el ancla, para reanudar donde iba.
  if (estadoSilencio().silenciada) {
    return { pistas: [], biblioteca: 0, origen: Date.now() };
  }

  const sello = selloBiblioteca();
  if (memo && Date.now() < memo.expira && memo.sello === sello) return memo.senal;

  const pistas = await pistasSenalBiblioteca();
  const estado = leerAire();
  const huellaNueva = huellaPistas(pistas);

  let pistasAire = pistas;
  let origen = Date.now();

  if (estado && huellaPistas(estado.pistas) === huellaNueva) {
    origen = estado.origen;
  } else if (estado && estado.pistas.length) {
    const aire = pistaAlAire(estado.pistas, estado.origen);
    if (aire) {
      const idx = pistas.findIndex((p) => p.id === aire.pista.id);
      if (idx >= 0 && aire.transcurridoMs < pistas[idx].duracionMs - 2000) {
        pistasAire = [...pistas.slice(idx), ...pistas.slice(0, idx)];
        origen = Date.now() - aire.transcurridoMs;
      }
    }
    // Si no siguió (la retiraron del aire), el bucle nuevo arranca de 0.
  }

  escribirAire({
    origen,
    sello,
    pistas: pistasAire.map((p) => ({ id: p.id, duracionMs: p.duracionMs })),
  });

  const senal: SenalExtendida = {
    pistas: pistasAire,
    biblioteca: pistasAire.length,
    origen,
  };
  memo = { senal, expira: Date.now() + VIDA_MEMO_MS, sello };
  return senal;
}

export function invalidarSenalMemo(): void {
  memo = null;
}
