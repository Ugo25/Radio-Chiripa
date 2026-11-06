import fs from "node:fs";
import path from "node:path";
import { DIR_BIBLIOTECA, nombreSeguro } from "@/lib/biblioteca";

export const dynamic = "force-dynamic";

const TIPOS_IMAGEN: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const { archivo: crudo } = await params;
  const nombre = nombreSeguro(decodeURIComponent(crudo));
  const ext = path.extname(nombre ?? "").toLowerCase();
  if (!nombre || !TIPOS_IMAGEN[ext]) return new Response(null, { status: 400 });

  const ruta = path.join(DIR_BIBLIOTECA, "portadas", nombre);
  let datos: Buffer;
  try {
    datos = fs.readFileSync(ruta);
  } catch {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(datos), {
    status: 200,
    headers: {
      "Content-Type": TIPOS_IMAGEN[ext],
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
