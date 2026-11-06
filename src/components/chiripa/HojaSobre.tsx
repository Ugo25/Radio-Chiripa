"use client";

import { FESTIVAL, SOBRE } from "@/lib/festival";
import type { Red } from "@/lib/redes-compartir";
import { etiquetaRed, IconoRed } from "./IconoRed";
import { Hoja } from "./Hoja";

export function HojaSobre({
  abierto,
  alCerrar,
  alBoletos,
  redes = [],
}: {
  abierto: boolean;
  alCerrar: () => void;
  alBoletos: () => void;
  redes?: Red[];
}) {
  // Sin redes configuradas mandan las cuentas de siempre de la casa.
  const lista: Red[] = redes.length
    ? redes
    : [
        { nombre: "Instagram", url: FESTIVAL.instagram, icono: "instagram" },
        { nombre: "TikTok", url: FESTIVAL.tiktok, icono: "tiktok" },
      ];

  return (
    <Hoja
      id="hojaSobre"
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Sobre Chiripa"
      subtitulo="Música y arte"
      etiqueta="Sobre el festival"
      pie={
        <button className="chiripa-accion chiripa-accion-primaria" type="button" onClick={alBoletos}>
          Ver boletos
        </button>
      }
    >
      {SOBRE.parrafos.map((p, i) => (
        <p key={i} className="chiripa-sobre-parrafo">
          {p}
        </p>
      ))}

      <div className="chiripa-sobre-fecha">
        <span className="chiripa-sobre-dia">{FESTIVAL.fechas}</span>
        <span className="chiripa-sobre-sede">{FESTIVAL.lugar}</span>
        <span className="chiripa-sobre-ciudad">{FESTIVAL.ciudad}</span>
      </div>

      <dl className="chiripa-sobre-lista">
        <div className="chiripa-sobre-fila">
          <dt>Dirección</dt>
          <dd>{FESTIVAL.direccion}</dd>
        </div>
        <div className="chiripa-sobre-fila">
          <dt>Boletos</dt>
          <dd>{SOBRE.boletos}</dd>
        </div>
        {lista.map((red) => (
          <div key={`${red.nombre}-${red.url}`} className="chiripa-sobre-fila">
            <dt>{red.nombre}</dt>
            <dd>
              <a href={red.url} target="_blank" rel="noopener">
                <IconoRed icono={red.icono} className="chiripa-sobre-icono" />
                {etiquetaRed(red.url)}
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </Hoja>
  );
}
