import { estadoSilencio, mensajeNocturno } from "@/lib/estado-radio";
import { pistaAlAire } from "@/lib/programacion";
import { obtenerSenalExtendida } from "@/lib/senal-extendida";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Silencio (emergencia o nocturno): se avisa con el motivo para que los
    // reproductores corten el audio y muestren por qué, en vez de "sin señal".
    const silencio = estadoSilencio();
    if (silencio.silenciada) {
      // El nocturno saluda y anuncia la hora de vuelta (hora de Mazatlán);
      // la emergencia muestra la cara por defecto de la radio con el aviso
      // de señal no disponible, que arma el reproductor.
      const nocturno =
        silencio.motivo === "nocturno"
          ? mensajeNocturno(silencio.reanudacionISO)
          : null;
      return Response.json(
        {
          silenciada: true,
          motivo: silencio.motivo,
          reanudacionISO: silencio.reanudacionISO,
          ...(nocturno
            ? {
                titulo: nocturno.titulo,
                detalle: nocturno.detalle,
                mensaje: nocturno.mensaje,
              }
            : {}),
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    const senal = await obtenerSenalExtendida();
    const aire = pistaAlAire(senal.pistas, senal.origen);
    if (!aire) return Response.json(null, { status: 503 });

    const { pista, transcurridoMs, indice } = aire;
    // La siguiente de la rotación: el reproductor la precarga para que el
    // cambio de canción sea inmediato, sin segundos de silencio.
    const siguiente = senal.pistas.length
      ? senal.pistas[(indice + 1) % senal.pistas.length]
      : undefined;
    return Response.json(
      {
        id: pista.id,
        titulo: pista.titulo,
        artista: pista.artista,
        album: pista.album || undefined,
        portada: pista.portada,
        duracionSeg: Math.round(pista.duracionMs / 1000),
        empezoISO: new Date(Date.now() - transcurridoMs).toISOString(),
        audioUrl: pista.audioUrl,
        origen: "biblioteca",
        siguiente: siguiente?.audioUrl
          ? {
              id: siguiente.id,
              titulo: siguiente.titulo,
              audioUrl: siguiente.audioUrl,
            }
          : undefined,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(null, { status: 503 });
  }
}
