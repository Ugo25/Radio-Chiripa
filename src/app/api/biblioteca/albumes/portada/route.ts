import {
  guardarPortadaAlbum,
  leerAlbumes,
  quitarPortadaAlbum,
} from "@/lib/albumes";
import { sesionValidaConToken } from "@/lib/gestor-auth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function prohibido() {
  return Response.json(
    { conectado: false, error: "Sesión del gestor no válida" },
    { status: 401, headers: NO_STORE },
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
  const id = String(forma.get("id") ?? "");
  const imagen = forma.get("imagen");
  if (!id || !(imagen instanceof File)) {
    return Response.json(
      { error: "Falta el álbum o la imagen" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const album = guardarPortadaAlbum(
      id,
      Buffer.from(await imagen.arrayBuffer()),
      imagen.type,
    );
    if (!album) {
      return Response.json(
        { error: "Ese álbum no existe" },
        { status: 404, headers: NO_STORE },
      );
    }
    return Response.json({ album }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "no se pudo guardar" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function DELETE(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id || !leerAlbumes().some((a) => a.id === id)) {
    return Response.json(
      { error: "Ese álbum no existe" },
      { status: 404, headers: NO_STORE },
    );
  }
  const album = quitarPortadaAlbum(id);
  return Response.json({ album }, { headers: NO_STORE });
}
