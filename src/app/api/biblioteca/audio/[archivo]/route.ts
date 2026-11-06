import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { buscarPorArchivo, nombreSeguro, tipoDe } from "@/lib/biblioteca";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ archivo: string }> },
) {
  const { archivo: crudo } = await params;
  const nombre = nombreSeguro(decodeURIComponent(crudo));
  if (!nombre) return new Response(null, { status: 400 });

  if (!buscarPorArchivo(nombre)) return new Response(null, { status: 404 });

  const ruta = path.join(process.cwd(), "media", "biblioteca", nombre);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(ruta);
  } catch {
    return new Response(null, { status: 404 });
  }

  const base: Record<string, string> = {
    "Content-Type": tipoDe(nombre),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  const rango = req.headers.get("range");
  if (!rango) {
    const flujo = Readable.toWeb(
      fs.createReadStream(ruta),
    ) as ReadableStream<Uint8Array>;
    return new Response(flujo, {
      status: 200,
      headers: { ...base, "Content-Length": String(stat.size) },
    });
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(rango.trim());
  if (!m) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }
  const inicio = m[1] ? Number.parseInt(m[1], 10) : 0;
  let fin = m[2] ? Number.parseInt(m[2], 10) : stat.size - 1;
  if (!Number.isFinite(fin) || fin >= stat.size) fin = stat.size - 1;
  if (inicio > fin || inicio >= stat.size) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }

  const flujo = Readable.toWeb(
        // El Range deja al <audio> arrancar en el segundo exacto de la señal sin bajar el archivo completo.
    fs.createReadStream(ruta, { start: inicio, end: fin }),
  ) as ReadableStream<Uint8Array>;
  return new Response(flujo, {
    status: 206,
    headers: {
      ...base,
      "Content-Range": `bytes ${inicio}-${fin}/${stat.size}`,
      "Content-Length": String(fin - inicio + 1),
    },
  });
}
