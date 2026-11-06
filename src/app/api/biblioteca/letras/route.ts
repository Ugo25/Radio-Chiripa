import { sesionValidaConToken } from "@/lib/gestor-auth";
import { normalizarLetra } from "@/lib/letra-formato";
import {
  actualizarLetrasFaltantes,
  borrarLetra,
  esInstrumental,
  letraGuardada,
  registrarInstrumental,
  registrarLetra,
  type ResumenLetras,
} from "@/lib/letras";
import { buscarPorId, leerBiblioteca } from "@/lib/biblioteca";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function prohibido() {
  return Response.json(
    { conectado: false, error: "Sesión del gestor no válida" },
    { status: 401, headers: NO_STORE },
  );
}

export async function GET(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const lista = leerBiblioteca();
  const conLetra = lista.filter(
    (c) => letraGuardada(c.id) || esInstrumental(c.id),
  ).length;
  return Response.json(
    { total: lista.length, conLetra, sinLetra: lista.length - conLetra },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const resumen: ResumenLetras = await actualizarLetrasFaltantes();
  return Response.json({ resumen }, { headers: NO_STORE });
}

export async function PUT(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const cuerpo = (await req.json().catch(() => null)) as
    | { id?: string; letra?: string; instrumental?: boolean }
    | null;
  const id = String(cuerpo?.id ?? "");
  const cancion = buscarPorId(id);
  if (!cancion) {
    return Response.json(
      { error: "Canción no encontrada" },
      { status: 404, headers: NO_STORE },
    );
  }
  if (typeof cuerpo?.instrumental === "boolean") {
    if (cuerpo.instrumental) {
      await registrarInstrumental(cancion.id, cancion.titulo, cancion.artista);
      return Response.json({ ok: true, instrumental: true }, { headers: NO_STORE });
    }
    await borrarLetra(cancion.id);
    return Response.json({ ok: true, instrumental: false }, { headers: NO_STORE });
  }
  const letra = normalizarLetra(String(cuerpo?.letra ?? ""));
  if (letra.trim()) {
    await registrarLetra(cancion.id, cancion.titulo, cancion.artista, letra);
    return Response.json(
      { ok: true, conLetra: true },
      { headers: NO_STORE },
    );
  }
  await borrarLetra(cancion.id);
  return Response.json({ ok: true, conLetra: false }, { headers: NO_STORE });
}
