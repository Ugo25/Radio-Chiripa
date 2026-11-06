import { guardarFotoCuenta } from "@/lib/cuentas";
import { sesionValidaConToken } from "@/lib/gestor-auth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  if (!sesionValidaConToken(req)) {
    return Response.json(
      { conectado: false, error: "Sesión del gestor no válida" },
      { status: 401, headers: NO_STORE },
    );
  }
  let forma: FormData;
  try {
    forma = await req.formData();
  } catch {
    return Response.json(
      { error: "No se pudo leer la subida" },
      { status: 400, headers: NO_STORE },
    );
  }
  const foto = forma.get("foto");
  if (!(foto instanceof File)) {
    return Response.json(
      { error: "Falta la foto (campo 'foto')" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const datos = Buffer.from(await foto.arrayBuffer());
    const ruta = guardarFotoCuenta(datos, foto.type);
    return Response.json({ foto: ruta }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "no se pudo guardar la foto" },
      { status: 400, headers: NO_STORE },
    );
  }
}
