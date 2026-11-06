import { cookieSesion, esDueno, sesionValidaConToken } from "@/lib/gestor-auth";
import {
  cambiarPin,
  loginPinDisponible,
  pinDelEntorno,
  pinPersonalizado,
} from "@/lib/llave-servidor";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export const VERSION_PANEL = "1.4.0";

function prohibido() {
  return Response.json(
    { conectado: false, error: "Sesión del gestor no válida" },
    { status: 401, headers: NO_STORE },
  );
}

export async function GET(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  return Response.json(
    {
      version: VERSION_PANEL,
      pinPersonalizado: pinPersonalizado(),
      pinDelEntorno: pinDelEntorno(),
      loginPinDisponible: loginPinDisponible(),
    },
    { headers: NO_STORE },
  );
}

export async function PATCH(req: Request) {
  if (!sesionValidaConToken(req)) return prohibido();
  if (!esDueno(req)) {
    return Response.json(
      { error: "Solo el dueño puede cambiar el PIN" },
      { status: 403, headers: NO_STORE },
    );
  }
  const cuerpo = (await req.json().catch(() => null)) as {
    pinActual?: string;
    pinNuevo?: string;
  } | null;
  if (!cuerpo?.pinActual || !cuerpo?.pinNuevo) {
    return Response.json(
      { error: "Falta el PIN actual o el nuevo" },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const { token } = cambiarPin(String(cuerpo.pinActual), String(cuerpo.pinNuevo));
    return Response.json(
      {
        ok: true,
        token,
        aviso:
          "PIN cambiado: todas las demás sesiones quedaron cerradas (las cuentas entran de nuevo con su contraseña).",
      },
      {
        headers: {
          "Set-Cookie": cookieSesion(token),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "no se pudo cambiar el PIN" },
      { status: 400, headers: NO_STORE },
    );
  }
}
