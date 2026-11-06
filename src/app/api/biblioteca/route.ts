import {
  agregarArchivo,
  buscarPorId,
  editarCancion,
  eliminarCancion,
  leerBiblioteca,
  reintentarPortada,
  TAMANO_MAXIMO,
} from "@/lib/biblioteca";
import { sesionValidaConToken } from "@/lib/gestor-auth";
import { actualizarLetra } from "@/lib/letras";
import { esInstrumental, letraGuardada } from "@/lib/letras";
import { invalidarSenalMemo } from "@/lib/senal-extendida";

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
  const lista = leerBiblioteca().sort((a, b) =>
    (a.subidoISO + a.titulo).localeCompare(b.subidoISO + b.titulo),
  );
  const canciones = lista.map((c) => ({
    ...c,
    conLetra: letraGuardada(c.id) !== null || esInstrumental(c.id),
    instrumental: esInstrumental(c.id),
  }));
  return Response.json(
    {
      canciones,
      meta: {
        total: canciones.length,
        activas: canciones.filter((c) => c.activa).length,
        tamanoBytes: canciones.reduce((s, c) => s + c.tamanoBytes, 0),
        tamanoMaximo: TAMANO_MAXIMO,
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();

  let forma: FormData;
  try {
    forma = await req.formData();
  } catch {
    return Response.json(
      { error: "No se pudo leer la subida" },
      { status: 400, headers: NO_STORE },
    );
  }

  const archivos = forma.getAll("archivos").filter((v): v is File => v instanceof File);
  if (!archivos.length) {
    return Response.json(
      { error: "No llegó ningún archivo" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (archivos.length > 12) {
    return Response.json(
      { error: "Máximo 12 archivos por subida (usa varias tandas)" },
      { status: 400, headers: NO_STORE },
    );
  }

  const albumDestino = String(forma.get("albumId") ?? "").trim() || null;

  const subidas: Awaited<ReturnType<typeof agregarArchivo>>[] = [];
  const errores: { nombre: string; error: string }[] = [];

  for (const archivo of archivos) {
    try {
      const datos = Buffer.from(await archivo.arrayBuffer());
      const nueva = await agregarArchivo(datos, archivo.name, archivo.type);
      if (albumDestino && !nueva.albumId) {
        const editada = editarCancion(nueva.id, { albumId: albumDestino });
        if (editada) subidas.push(editada);
        else subidas.push(nueva);
      } else {
        subidas.push(nueva);
      }
    } catch (error) {
      errores.push({
        nombre: archivo.name,
        error: error instanceof Error ? error.message : "no se pudo subir",
      });
    }
  }

  if (subidas.length) {
    invalidarSenalMemo();
    for (const subida of subidas) {
      void actualizarLetra(subida.id).catch(() => undefined);
    }
  }

  return Response.json({ subidas, errores }, { headers: NO_STORE });
}

export async function PATCH(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const cuerpo = (await req.json().catch(() => null)) as {
    id?: string;
    titulo?: string;
    artista?: string;
    album?: string;
    albumId?: string | null;
    activa?: boolean;
    reintentarPortada?: boolean;
  } | null;
  if (!cuerpo?.id) {
    return Response.json(
      { error: "Falta el id de la canción" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (cuerpo.reintentarPortada) {
    const final = await reintentarPortada(cuerpo.id);
    if (!final) {
      return Response.json(
        { error: "Esa canción no existe" },
        { status: 404, headers: NO_STORE },
      );
    }
    invalidarSenalMemo();
    return Response.json(
      { cancion: final, portadaReintentada: true },
      { headers: NO_STORE },
    );
  }
    // Se lee ANTES de editar: comparar después jamás detectaría el cambio de título/artista.
  const previa = buscarPorId(cuerpo.id);
  const editada = editarCancion(cuerpo.id, {
    titulo: cuerpo.titulo,
    artista: cuerpo.artista,
    album: cuerpo.album,
    albumId: cuerpo.albumId,
    activa: cuerpo.activa,
  });
  if (!editada) {
    return Response.json(
      { error: "Esa canción no existe" },
      { status: 404, headers: NO_STORE },
    );
  }
  invalidarSenalMemo();
  const cambioNombres =
    (!!previa &&
      ((typeof cuerpo.titulo === "string" && cuerpo.titulo.trim() !== previa.titulo) ||
        (typeof cuerpo.artista === "string" && cuerpo.artista.trim() !== previa.artista))) ||
    !previa;
  let final = editada;
  if (cambioNombres) {
    final = (await reintentarPortada(cuerpo.id)) ?? editada;
    void actualizarLetra(cuerpo.id, true).catch(() => undefined);
  }
  return Response.json({ cancion: final }, { headers: NO_STORE });
}

export async function DELETE(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return Response.json(
      { error: "Falta el id de la canción" },
      { status: 400, headers: NO_STORE },
    );
  }
  const ok = eliminarCancion(id);
  if (!ok) {
    return Response.json(
      { error: "Esa canción no existe" },
      { status: 404, headers: NO_STORE },
    );
  }
  invalidarSenalMemo();
  return Response.json({ borrada: true }, { headers: NO_STORE });
}
