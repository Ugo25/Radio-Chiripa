import fs from "node:fs";
import path from "node:path";
import { DIR_FOTOS_CUENTAS } from "@/lib/cuentas";

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
  const base = path.basename(decodeURIComponent(crudo));
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(base)) {
    return new Response(null, { status: 400 });
  }
  const ext = path.extname(base).toLowerCase();
  if (!TIPOS_IMAGEN[ext]) return new Response(null, { status: 400 });

  let datos: Buffer;
  try {
    datos = fs.readFileSync(path.join(DIR_FOTOS_CUENTAS, base));
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
