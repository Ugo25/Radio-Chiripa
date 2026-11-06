import { contarOyentes } from "@/lib/oyentes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cliente = req.headers.get("x-cliente-id")?.slice(0, 64) ?? "";
  const oyentes = contarOyentes(cliente);

  if (oyentes === 0) {
    return Response.json({}, { status: 503 });
  }

  return Response.json(
    { espectadores: oyentes },
    { headers: { "Cache-Control": "no-store" } },
  );
}
