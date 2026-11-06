import { sesionValidaConToken } from "@/lib/gestor-auth";
import { invalidarSenalMemo } from "@/lib/senal-extendida";
import {
  escribirEstadoRadio,
  estadoSilencio,
  horaValida,
  leerEstadoRadio,
} from "@/lib/estado-radio";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Estado del silencio de la señal; lo consulta el panel cada ronda. */
export async function GET() {
  return Response.json(estadoSilencio(), { headers: NO_STORE });
}

/**
 * Control de la señal desde el panel:
 *  - panico: silencia ya (minutos opcional; sin minutos queda hasta reactivar)
 *  - reactivar: devuelve la señal al aire donde iba
 *  - nocturno: programa el silencio nocturno recurrente
 */
export async function POST(req: Request) {
  if (!sesionValidaConToken(req)) {
    return Response.json(
      { error: "Sesión del gestor no válida" },
      { status: 401, headers: NO_STORE },
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    accion?: string;
    minutos?: number;
    activo?: boolean;
    desde?: string;
    hasta?: string;
  };

  const estado = leerEstadoRadio();
  let aviso = "";

  if (body.accion === "panico") {
    const minutos = Math.round(Number(body.minutos) || 0);
    const ventana =
      minutos >= 1 && minutos <= 720
        ? { desde: Date.now(), hasta: Date.now() + minutos * 60_000 }
        : { desde: Date.now(), hasta: 0 };
    estado.emergencia = ventana;
    aviso =
      ventana.hasta > 0
        ? `Señal silenciada por ${minutos} minutos.`
        : "Señal silenciada hasta que la reactives.";
  } else if (body.accion === "reactivar") {
    estado.emergencia = { desde: 0, hasta: 0 };
    aviso = "Señal reactivada: la rotación sigue donde iba.";
  } else if (body.accion === "nocturno") {
    if (typeof body.activo === "boolean") estado.nocturno.activo = body.activo;
    if (horaValida(body.desde)) estado.nocturno.desde = body.desde;
    if (horaValida(body.hasta)) estado.nocturno.hasta = body.hasta;
    aviso = estado.nocturno.activo
      ? `Silencio nocturno guardado: de ${estado.nocturno.desde} a ${estado.nocturno.hasta} (hora de Mazatlán).`
      : "Silencio nocturno apagado.";
  } else {
    return Response.json(
      { error: "Acción no reconocida" },
      { status: 400, headers: NO_STORE },
    );
  }

  escribirEstadoRadio(estado);
  invalidarSenalMemo();
  return Response.json(
    { ok: true, aviso, ...estadoSilencio() },
    { headers: NO_STORE },
  );
}
