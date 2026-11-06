import { historialOyentes } from "@/lib/oyentes";

export const dynamic = "force-dynamic";

/** Audiencia de las últimas 24 h en pasos de 5 min (agregados, sin datos personales). */
export async function GET() {
  const { puntos, pico, promedio } = historialOyentes();
  return Response.json(
    { puntos, pico, promedio },
    { headers: { "Cache-Control": "no-store" } },
  );
}
