import { esDueno, sesionValidaConToken } from "@/lib/gestor-auth";
import { escribirRedes, leerRedes } from "@/lib/redes";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function prohibido() {
  return Response.json(
    { conectado: false, error: "Sesión del gestor no válida" },
    { status: 401, headers: NO_STORE },
  );
}

function soloDueno() {
  return Response.json(
    { error: "Las redes sociales las maneja el dueño de la radio" },
    { status: 403, headers: NO_STORE },
  );
}

export async function GET(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  return Response.json({ redes: leerRedes() }, { headers: NO_STORE });
}

export async function PUT(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  if (!esDueno(req)) return soloDueno();
  const cuerpo = (await req.json().catch(() => null)) as { redes?: unknown } | null;
  if (!cuerpo || !Array.isArray(cuerpo.redes)) {
    return Response.json(
      { error: "Falta la lista de redes" },
      { status: 400, headers: NO_STORE },
    );
  }
  const redes = escribirRedes(cuerpo.redes);
  return Response.json({ ok: true, redes }, { headers: NO_STORE });
}
