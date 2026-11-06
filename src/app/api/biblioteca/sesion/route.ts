import {
  cookieBorrada,
  cookieSesion,
  quienEntra,
  sesionValidaConToken,
  tokenDeSesion,
} from "@/lib/gestor-auth";
import { entrarConCuenta } from "@/lib/cuentas";
import {
  ipDe,
  limpiarIntentos,
  loginPermitido,
  pinEsCorrecto,
  registrarIntentoFallido,
} from "@/lib/llave-servidor";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function respuestaQuien(req: Request) {
  const quien = quienEntra(req);
  return quien
    ? {
        tipo: quien.tipo,
        nombre: quien.nombre,
        rol: quien.rol,
        foto: quien.foto,
      }
    : undefined;
}

export async function GET(req: Request) {
  const conectado = sesionValidaConToken(req);
  return Response.json(
    { conectado, quien: conectado ? respuestaQuien(req) : undefined },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const cuerpo = (await req.json().catch(() => null)) as {
    pin?: string;
    identidad?: string;
    contrasena?: string;
  } | null;

  const ip = ipDe(req);
  if (!loginPermitido(ip)) {
    return Response.json(
      {
        conectado: false,
        error: "Demasiados intentos: espera unos minutos y vuelve a probar",
      },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "120" } },
    );
  }

  if (cuerpo?.pin !== undefined) {
    const pin = String(cuerpo.pin);
    if (!pin || !pinEsCorrecto(pin)) {
      registrarIntentoFallido(ip);
      await new Promise((r) => setTimeout(r, 600));
      return Response.json(
        { conectado: false, error: "PIN incorrecto" },
        { status: 401, headers: NO_STORE },
      );
    }
    limpiarIntentos(ip);
    return Response.json(
      {
        conectado: true,
        token: tokenDeSesion(),
        quien: { tipo: "pin", nombre: "Dueño de la radio", rol: "dueno" },
      },
      { headers: { "Set-Cookie": cookieSesion(tokenDeSesion()), "Cache-Control": "no-store" } },
    );
  }

  const sesion = entrarConCuenta(
    String(cuerpo?.identidad ?? ""),
    String(cuerpo?.contrasena ?? ""),
  );
  if (!sesion) {
    registrarIntentoFallido(ip);
    await new Promise((r) => setTimeout(r, 600));
    return Response.json(
      {
        conectado: false,
        error: "Cuenta o contraseña incorrecta (o la cuenta está desactivada)",
      },
      { status: 401, headers: NO_STORE },
    );
  }
  limpiarIntentos(ip);
  return Response.json(
    {
      conectado: true,
      token: sesion.token,
      quien: {
        tipo: "cuenta",
        nombre: sesion.cuenta.nombre,
        rol: sesion.cuenta.rol,
        foto: sesion.cuenta.foto,
      },
    },
    {
      headers: {
        "Set-Cookie": cookieSesion(sesion.token),
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function DELETE() {
  return Response.json(
    { conectado: false },
    { headers: { "Set-Cookie": cookieBorrada(), "Cache-Control": "no-store" } },
  );
}
