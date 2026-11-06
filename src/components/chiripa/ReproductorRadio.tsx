"use client";

import { Info, Loader2, MessageSquareText, Music2, Pause, Play, Ticket, Users } from "lucide-react";
import { FESTIVAL } from "@/lib/festival";
import {
  formatearRestante,
  formatearTiempo,
  PORTADA_PLACEHOLDER,
  TEXTOS,
  type Cancion,
  type Silencio,
} from "@/lib/radio";

export function ReproductorRadio({
  cancion,
  sonando,
  transcurridoSeg,
  espectadores,
  aviso,
  silencio = null,
  listo = false,
  iniciando = false,
  alAlternar,
  alLetra,
  alCartel,
  alSobre,
}: {
  cancion: Cancion | null;
  sonando: boolean;
  transcurridoSeg: number;
  espectadores: number | null;
  aviso: string;
  silencio?: Silencio | null;
  listo?: boolean;
  iniciando?: boolean;
  alAlternar: () => void;
  alLetra: () => void;
  alCartel: () => void;
  alSobre: () => void;
}) {
  // Nocturno: saludo y hora de vuelta (vienen del servidor, hora de Mazatlán).
  // Emergencia: la cara por defecto de la radio; el aviso dice señal no disponible.
  const titulo = silencio
    ? silencio.motivo === "nocturno"
      ? silencio.titulo ?? TEXTOS.graciasTitulo
      : TEXTOS.sinCancionTitulo
    : (cancion?.titulo ?? TEXTOS.sinCancionTitulo);
  const artista = silencio
    ? silencio.motivo === "nocturno"
      ? silencio.detalle ?? TEXTOS.silencioNocturno
      : TEXTOS.sinCancionArtista
    : (cancion?.artista ?? TEXTOS.sinCancionArtista);
  const album = silencio ? undefined : cancion?.album;
  const portada = cancion?.portada ?? PORTADA_PLACEHOLDER;
  const porcentaje =
    !silencio && cancion?.duracionSeg && cancion.duracionSeg > 0
      ? Math.min(100, (transcurridoSeg / cancion.duracionSeg) * 100)
      : 0;
  const restante = cancion?.duracionSeg ? cancion.duracionSeg - transcurridoSeg : 0;

  return (
    <div className="chiripa-wrapper">
      <section className="chiripa-tarjeta" aria-label="Chiripa Radio">
        <div className={`chiripa-portada ${sonando ? "sonando" : "en-pausa"}`}>
          <img
            src={portada}
            alt={cancion ? `Portada de ${cancion.titulo}` : "Chiripa"}
            width={640}
            height={640}
          />
        </div>

        <div className="chiripa-info">
          <div className="chiripa-info-texto">
            <h2 className="chiripa-titulo">{titulo}</h2>
            <p className="chiripa-artista">{artista}</p>
            {album ? <p className="chiripa-album">{album}</p> : null}
          </div>
          <span
            className="chiripa-oyentes"
            title={
              espectadores !== null
                ? "Personas escuchando ahora"
                : "Se conecta con la señal"
            }
            aria-label={
              espectadores === null
                ? "Espectadores: sin conectar"
                : espectadores === 1
                  ? "1 persona escuchando"
                  : `${espectadores} personas escuchando`
            }
          >
            <Users aria-hidden="true" />
            {espectadores !== null ? espectadores : "—"}
          </span>
        </div>

        <div className="chiripa-progreso" aria-hidden={!cancion}>
          <div className="chiripa-progreso-pista">
            <div
              key={cancion?.id ?? "senal"}
              className={`chiripa-progreso-barra${sonando ? " sonando" : ""}`}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <div className="chiripa-progreso-tiempos">
            <span>{!silencio && cancion ? formatearTiempo(transcurridoSeg) : "–:–"}</span>
            <span>{!silencio && cancion ? formatearRestante(restante) : "–:–"}</span>
          </div>
        </div>

        <div className="chiripa-controles">
          <button
            className="chiripa-cta"
            type="button"
            onClick={alAlternar}
            aria-pressed={sonando}
            aria-label={sonando ? "Pausar la radio" : "Reproducir la radio"}
          >
            {iniciando || (!listo && !sonando) ? (
              <Loader2 aria-hidden="true" className="chiripa-cta-girando" />
            ) : sonando ? (
              <Pause aria-hidden="true" fill="currentColor" />
            ) : (
              <Play aria-hidden="true" fill="currentColor" />
            )}
          </button>
        </div>

        <p className="chiripa-aviso" role="status">
          {aviso}
        </p>

        <div className="chiripa-botones-detalle">
          <button
            className="chiripa-boton-detalle chiripa-boton-detalle-ancho"
            type="button"
            onClick={alLetra}
            aria-haspopup="dialog"
          >
            <MessageSquareText aria-hidden="true" />
            Ver la letra
          </button>
          <button
            className="chiripa-boton-detalle"
            type="button"
            onClick={alCartel}
            aria-haspopup="dialog"
          >
            <Music2 aria-hidden="true" />
            Ver el cartel
          </button>
          <button
            className="chiripa-boton-detalle"
            type="button"
            onClick={alSobre}
            aria-haspopup="dialog"
          >
            <Info aria-hidden="true" />
            Sobre Chiripa
          </button>
        </div>

        <div className="chiripa-enlaces">
          <a
            className="chiripa-enlace"
            href={FESTIVAL.passlineUrl}
            target="_blank"
            rel="noopener"
          >
            <Ticket aria-hidden="true" />
            Passline
          </a>
        </div>
      </section>
    </div>
  );
}
