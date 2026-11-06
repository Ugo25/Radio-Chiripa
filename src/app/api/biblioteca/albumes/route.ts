import {
  crearAlbum,
  eliminarAlbum,
  leerAlbumes,
  renombrarAlbum,
  tipoDeAlbum,
} from "@/lib/albumes";
import { leerBiblioteca, quitarAlbumDeCanciones } from "@/lib/biblioteca";
import { sesionValidaConToken } from "@/lib/gestor-auth";
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
  const canciones = leerBiblioteca();
  const albumes = leerAlbumes().map((album) => {
    const propias = canciones.filter((c) => c.albumId === album.id);
    return {
      ...album,
      tipo: tipoDeAlbum(album),
      canciones: propias.length,
      activas: propias.filter((c) => c.activa).length,
      duracionSeg: propias.reduce((s, c) => s + c.duracionSeg, 0),
      portada: album.portada ?? propias.find((c) => c.portada)?.portada,
      portadaPropia: !!album.portada,
    };
  });

  const porArtista = new Map<
    string,
    {
      nombre: string;
      canciones: number;
      activas: number;
      duracionSeg: number;
      portada?: string;
      albumes: Set<string>;
      sueltas: number;
    }
  >();
  for (const cancion of canciones) {
    const nombre = cancion.artista.trim() || "Artista desconocido";
    const grupo = porArtista.get(nombre) ?? {
      nombre,
      canciones: 0,
      activas: 0,
      duracionSeg: 0,
      portada: cancion.portada,
      albumes: new Set<string>(),
      sueltas: 0,
    };
    grupo.canciones++;
    if (cancion.activa) grupo.activas++;
    grupo.duracionSeg += cancion.duracionSeg;
    grupo.portada = grupo.portada ?? cancion.portada;
    if (cancion.albumId) grupo.albumes.add(cancion.albumId);
    else grupo.sueltas++;
    porArtista.set(nombre, grupo);
  }
  const artistas = [...porArtista.values()]
    .map((g) => ({
      nombre: g.nombre,
      canciones: g.canciones,
      activas: g.activas,
      duracionSeg: g.duracionSeg,
      portada: g.portada,
      albumes: g.albumes.size,
      sueltas: g.sueltas,
    }))
    .sort((a, b) => b.canciones - a.canciones || a.nombre.localeCompare(b.nombre, "es"));

  const sueltas = canciones.filter((c) => !c.albumId).length;
  return Response.json({ albumes, artistas, sueltas }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const cuerpo = (await req.json().catch(() => null)) as
    | { nombre?: string; tipo?: string }
    | null;
  try {
    const album = crearAlbum(
      String(cuerpo?.nombre ?? ""),
      typeof cuerpo?.tipo === "string" ? cuerpo.tipo : undefined,
    );
    return Response.json({ album }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "no se pudo crear" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function PATCH(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const cuerpo = (await req.json().catch(() => null)) as {
    id?: string;
    nombre?: string;
    tipo?: string;
  } | null;
  if (!cuerpo?.id) {
    return Response.json(
      { error: "Falta el id del álbum" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const album = renombrarAlbum(
      cuerpo.id,
      String(cuerpo.nombre ?? ""),
      typeof cuerpo.tipo === "string" ? cuerpo.tipo : undefined,
    );
    if (!album) {
      return Response.json(
        { error: "Ese álbum no existe" },
        { status: 404, headers: NO_STORE },
      );
    }
    invalidarSenalMemo();
    return Response.json({ album }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "no se pudo renombrar" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function DELETE(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return Response.json(
      { error: "Falta el id del álbum" },
      { status: 400, headers: NO_STORE },
    );
  }
  quitarAlbumDeCanciones(id);
  if (!eliminarAlbum(id)) {
    return Response.json(
      { error: "Ese álbum no existe" },
      { status: 404, headers: NO_STORE },
    );
  }
  invalidarSenalMemo();
  return Response.json({ borrada: true }, { headers: NO_STORE });
}
