import { esDueno, sesionValidaConToken } from "@/lib/gestor-auth";
import { aplicarRespaldo, construirRespaldo, leerRespaldo } from "@/lib/respaldo";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const TAMANO_MAXIMO = 128 * 1024 * 1024;

function prohibido() {
  return Response.json(
    { conectado: false, error: "Sesión del gestor no válida" },
    { status: 401, headers: NO_STORE },
  );
}

function soloDueno() {
  return Response.json(
    { error: "El respaldo completo y la importación son cosa del dueño" },
    { status: 403, headers: NO_STORE },
  );
}

export async function GET(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  if (!esDueno(req)) return soloDueno();

  const zip = await construirRespaldo();
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="chiripa-respaldo-${fecha}.zip"`,
      ...NO_STORE,
    },
  });
}

export async function POST(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  if (!esDueno(req)) return soloDueno();

  const forma = await req.formData().catch(() => null);
  const archivo = forma?.get("respaldo");
  if (!(archivo instanceof File)) {
    return Response.json(
      { error: "Manda el respaldo en el campo «respaldo»" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!archivo.size) {
    return Response.json(
      { error: "El archivo llegó vacío" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return Response.json(
      { error: "El respaldo pasa de 128 MB" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const datos = Buffer.from(await archivo.arrayBuffer());
    const entradas = leerRespaldo(datos, archivo.name || "respaldo");
    const informe = await aplicarRespaldo(entradas);
    return Response.json({ ok: true, informe }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo importar el respaldo" },
      { status: 400, headers: NO_STORE },
    );
  }
}
