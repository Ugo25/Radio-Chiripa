import fs from "node:fs";
import path from "node:path";

/**
 * Estado de la señal al aire: silencio de emergencia (botón de pánico) y
 * silencio nocturno programado. Un archivo chico en media/ decide si la
 * rotación suena; ahora-playing devuelve 503 mientras esté silenciada y el
 * ancla del bucle (aire.json) no se toca, así la señal reanuda donde iba.
 */

const ARCHIVO = path.join(process.cwd(), "media", "estado-radio.json");
/** La radio vive en Mazatlán: las ventanas horarias se leen en su hora. */
const ZONA = "America/Mazatlan";

export type SilencioNocturno = { activo: boolean; desde: string; hasta: string };

export type EstadoRadio = {
  emergencia: { desde: number; hasta: number }; // hasta = 0 → hasta reactivar a mano
  nocturno: SilencioNocturno;
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function base(): EstadoRadio {
  return {
    emergencia: { desde: 0, hasta: 0 },
    nocturno: { activo: false, desde: "23:00", hasta: "06:00" },
  };
}

export function horaValida(hora: unknown): hora is string {
  return typeof hora === "string" && HORA.test(hora);
}

export function leerEstadoRadio(): EstadoRadio {
  try {
    const datos = JSON.parse(fs.readFileSync(ARCHIVO, "utf8")) as Partial<EstadoRadio>;
    const baseActual = base();
    return {
      emergencia: {
        desde: Number(datos?.emergencia?.desde) || 0,
        hasta: Number(datos?.emergencia?.hasta) || 0,
      },
      nocturno: {
        activo: !!datos?.nocturno?.activo,
        desde: horaValida(datos?.nocturno?.desde)
          ? datos.nocturno.desde
          : baseActual.nocturno.desde,
        hasta: horaValida(datos?.nocturno?.hasta)
          ? datos.nocturno.hasta
          : baseActual.nocturno.hasta,
      },
    };
  } catch {
    return base();
  }
}

export function escribirEstadoRadio(estado: EstadoRadio): void {
  try {
    fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
    const temporal = `${ARCHIVO}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(estado, null, 2), "utf8");
    fs.renameSync(temporal, ARCHIVO);
  } catch {
    /* sin disco: el estado vive mientras viva el proceso */
  }
}

function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function minutosDelDia(ahora: number): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ahora));
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return hora * 60 + minuto;
}

/** Instante (epoch) de la hora "HH:MM" de hoy en la zona de la radio. */
function instanteEnZona(hora: string, ahora: number): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ahora));
  const datos: Record<string, string> = {};
  for (const p of partes) datos[p.type] = p.value;
  // Mazatlán no cambia de horario desde 2022: el offset es fijo y este
  // cálculo da el epoch exacto sin tablas de zona.
  const supuesto = Date.parse(
    `${datos.year}-${datos.month}-${datos.day}T${hora}:00Z`,
  );
  const ahoraLocal = Date.parse(
    `${datos.year}-${datos.month}-${datos.day}T${datos.hour}:${datos.minute}:00Z`,
  );
  const offset = ahoraLocal - ahora;
  return supuesto - offset;
}

export type EstadoSilencio = {
  silenciada: boolean;
  motivo: "emergencia" | "nocturno" | null;
  reanudacionISO?: string;
  nocturno: SilencioNocturno;
};

export function estadoSilencio(ahora = Date.now()): EstadoSilencio {
  const estado = leerEstadoRadio();
  const { desde, hasta } = estado.emergencia;
  if (desde > 0 && (hasta === 0 || ahora < hasta)) {
    return {
      silenciada: true,
      motivo: "emergencia",
      reanudacionISO: hasta > 0 ? new Date(hasta).toISOString() : undefined,
      nocturno: estado.nocturno,
    };
  }
  if (estado.nocturno.activo) {
    const min = minutosDelDia(ahora);
    const desdeMin = aMinutos(estado.nocturno.desde);
    const hastaMin = aMinutos(estado.nocturno.hasta);
    const dentro =
      desdeMin !== hastaMin &&
      (desdeMin < hastaMin
        ? min >= desdeMin && min < hastaMin
        : min >= desdeMin || min < hastaMin);
    if (dentro) {
      const hoy = instanteEnZona(estado.nocturno.hasta, ahora);
      const reanudacion = hoy > ahora ? hoy : hoy + 24 * 60 * 60 * 1000;
      return {
        silenciada: true,
        motivo: "nocturno",
        reanudacionISO: new Date(reanudacion).toISOString(),
        nocturno: estado.nocturno,
      };
    }
  }
  return { silenciada: false, motivo: null, nocturno: estado.nocturno };
}

export function senalSilenciada(): boolean {
  return estadoSilencio().silenciada;
}

const FORMATO_HORA = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function diaEnZona(instante: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instante));
}

/** El mensaje amable que la radio muestra durante el silencio nocturno:
    "Gracias por escuchar. Volvemos mañana a las 6:00 AM." (hora de Mazatlán). */
export function mensajeNocturno(
  reanudacionISO: string | undefined,
  ahora = Date.now(),
): { titulo: string; detalle: string; mensaje: string } {
  if (!reanudacionISO) {
    return {
      titulo: "Gracias por escuchar",
      detalle: "Volvemos mañana",
      mensaje: "Gracias por escuchar. Volvemos mañana.",
    };
  }
  const reanudacion = Date.parse(reanudacionISO);
  const hora = FORMATO_HORA.format(new Date(reanudacion));
  const dia = diaEnZona(reanudacion) === diaEnZona(ahora) ? "hoy" : "mañana";
  return {
    titulo: "Gracias por escuchar",
    detalle: `Volvemos ${dia} a las ${hora}`,
    mensaje: `Gracias por escuchar. Volvemos ${dia} a las ${hora}.`,
  };
}
