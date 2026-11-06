import { adivinarIcono } from "@/lib/redes-compartir";
import { leerRedes } from "@/lib/redes";

export const dynamic = "force-dynamic";

/** Redes visibles para todos: el reproductor y la hoja de Sobre Chiripa. */
export async function GET() {
  const redes = leerRedes().map((r) => ({ ...r, icono: r.icono || adivinarIcono(r.url) }));
  return Response.json(
    { redes },
    { headers: { "Cache-Control": "no-store" } },
  );
}
