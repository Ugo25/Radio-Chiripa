import type { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * El centinela de cambios: long-poll que aguanta la respuesta hasta que algo
 * de media/ cambie (o 20 s, lo que ocurra primero). Los reproductores lo
 * consultan en bucle y, al recibir un cambio, refrescan now-playing y letras
 * al instante — sin esperar su latido normal de hasta 5 minutos.
 */

const VIGIADOS: { clave: string; archivo: string }[] = [
  { clave: "senal", archivo: "aire.json" }, // ancla de la rotación
  { clave: "silencio", archivo: "estado-radio.json" }, // pánico y nocturno
  { clave: "biblioteca", archivo: "biblioteca.json" }, // altas, bajas, ediciones
  { clave: "letras", archivo: "letras.json" }, // letras pegadas a mano
  { clave: "albumes", archivo: "albumes.json" }, // álbumes y portadas
];

const AGUANTE_MS = 20_000;
const LATIDO_MS = 1_000;

type Sellos = Record<string, number>;

function medir(): { version: number; cambios: Sellos } {
  const sellos: Sellos = {};
  let version = 0;
  for (const { clave, archivo } of VIGIADOS) {
    try {
      const mtime = fs.statSync(path.join(process.cwd(), "media", archivo)).mtimeMs;
      sellos[clave] = mtime;
      if (mtime > version) version = mtime;
    } catch {
      /* sin archivo no hay sello: no cuenta como cambio */
    }
  }
  return { version, cambios: sellos };
}

export async function GET(req: NextRequest) {
  const desde = Number(new URL(req.url).searchParams.get("desde") ?? 0) || 0;
  const limite = Date.now() + AGUANTE_MS;
  let estado = medir();
  // Primera visita (sin desde): responde al instante para fijar la línea base.
  while (
    desde > 0 &&
    estado.version === desde &&
    Date.now() < limite &&
    !req.signal.aborted
  ) {
    await new Promise((r) => setTimeout(r, LATIDO_MS));
    estado = medir();
  }
  return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}
