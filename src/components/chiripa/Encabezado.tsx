"use client";

import { Share2 } from "lucide-react";
import { FESTIVAL } from "@/lib/festival";
import type { Red } from "@/lib/redes-compartir";
import { IconoRed } from "./IconoRed";

export function Encabezado({
  alCompartir,
  redes = [],
}: {
  alCompartir: () => void;
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
    <header className="chiripa-header">
      <h1>
        <span className="chiripa-inicial">C</span>hiripa
      </h1>
      <div className="chiripa-header-linea">
        <span>Festival De Música y Arte</span>
        <span
          className="chiripa-fase chiripa-fase-vivo"
          role="status"
          aria-label="Señal en vivo"
        >
          <span className="chiripa-fase-punto" aria-hidden="true" />
          En vivo
        </span>
      </div>
      <div className="chiripa-creditos">
        <span>{FESTIVAL.edicion}</span>
        {lista.map((red) => (
          <a
            key={`${red.nombre}-${red.url}`}
            className="chiripa-red"
            href={red.url}
            target="_blank"
            rel="noopener"
            aria-label={red.nombre}
            title={red.nombre}
          >
            <IconoRed icono={red.icono} />
          </a>
        ))}
        <button
          className="chiripa-red"
          type="button"
          onClick={alCompartir}
          title="Compartir el festival"
          aria-label="Compartir el festival"
        >
          <Share2 aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
