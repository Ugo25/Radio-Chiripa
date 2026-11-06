import {
  crearCuenta,
  editarCuenta,
  eliminarCuenta,
  leerCuentas,
  type Rol,
} from "@/lib/cuentas";
import { esDueno, sesionValidaConToken } from "@/lib/gestor-auth";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function prohibido() {
  return Response.json(
    { conectado: false, error: "Sesión del gestor no válida" },
    { status: 401, headers: NO_STORE },
  );
}

function soloDueño(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  if (!esDueno(req)) {
    return Response.json(
      { error: "Solo el dueño puede administrar las cuentas" },
      { status: 403, headers: NO_STORE },
    );
  }
  return null;
}

export async function GET(req: Request) {
  const bloqueo = soloDueño(req);
  if (bloqueo) return bloqueo;
  return Response.json({ cuentas: leerCuentas() }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const bloqueo = soloDueño(req);
  if (bloqueo) return bloqueo;
  const cuerpo = (await req.json().catch(() => null)) as {
    nombre?: string;
    correo?: string;
    usuario?: string;
    contrasena?: string;
    rol?: Rol;
    foto?: string;
  } | null;
  try {
    const cuenta = crearCuenta({
      nombre: String(cuerpo?.nombre ?? ""),
      correo: cuerpo?.correo,
      usuario: cuerpo?.usuario,
      contrasena: String(cuerpo?.contrasena ?? ""),
      rol: (cuerpo?.rol ?? "colaborador") as Rol,
      foto: cuerpo?.foto,
    });
    return Response.json({ cuenta }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "no se pudo crear la cuenta" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function PATCH(req: Request) {
  const bloqueo = soloDueño(req);
  if (bloqueo) return bloqueo;
  const cuerpo = (await req.json().catch(() => null)) as {
    id?: string;
    nombre?: string;
    correo?: string;
    usuario?: string;
    contrasena?: string;
    rol?: Rol;
    foto?: string;
    activo?: boolean;
  } | null;
  if (!cuerpo?.id) {
    return Response.json(
      { error: "Falta el id de la cuenta" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const cuenta = editarCuenta(cuerpo.id, {
      nombre: cuerpo.nombre,
      correo: cuerpo.correo,
      usuario: cuerpo.usuario,
      contrasena: cuerpo.contrasena,
      rol: cuerpo.rol,
      foto: cuerpo.foto,
      activo: cuerpo.activo,
    });
    if (!cuenta) {
      return Response.json(
        { error: "Esa cuenta no existe" },
        { status: 404, headers: NO_STORE },
      );
    }
    return Response.json({ cuenta }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "no se pudo editar la cuenta" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function DELETE(req: Request) {
  const bloqueo = soloDueño(req);
  if (bloqueo) return bloqueo;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return Response.json(
      { error: "Falta el id de la cuenta" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!eliminarCuenta(id)) {
    return Response.json(
      { error: "Esa cuenta no existe" },
      { status: 404, headers: NO_STORE },
    );
  }
  return Response.json({ borrada: true }, { headers: NO_STORE });
}
