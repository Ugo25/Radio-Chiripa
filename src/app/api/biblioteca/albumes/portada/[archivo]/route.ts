import fs from "node:fs";
import { rutaPortadaAlbum } from "@/lib/albumes";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const { archivo } = await params;
  const ruta = rutaPortadaAlbum(decodeURIComponent(archivo));
  if (!ruta) return new Response(null, { status: 400 });
  let datos: Buffer;
  try {
    datos = fs.readFileSync(ruta);
  } catch {
    return new Response(null, { status: 404 });
  }
  const punto = ruta.slice(ruta.lastIndexOf("."));
  return new Response(new Uint8Array(datos), {
    status: 200,
    headers: {
      "Content-Type": TIPOS[punto] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
