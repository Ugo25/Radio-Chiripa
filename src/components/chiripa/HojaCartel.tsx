"use client";

import { ArrowUpRight } from "lucide-react";
import { CARTEL, CARTEL_IMAGEN, FESTIVAL } from "@/lib/festival";
import { Hoja } from "./Hoja";

export function HojaCartel({
  abierto,
  alCerrar,
}: {
  abierto: boolean;
  alCerrar: () => void;
}) {
  return (
    <Hoja
      id="hojaCartel"
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Cartel"
      subtitulo={`${FESTIVAL.fase} · ${FESTIVAL.edicion}`}
      etiqueta="Cartel del festival"
      pie={
        <a
          className="chiripa-accion chiripa-accion-primaria"
          href={FESTIVAL.instagramCartel}
          target="_blank"
          rel="noopener"
        >
          Ir al cartel
          <ArrowUpRight aria-hidden="true" />
        </a>
      }
    >
      <div className="chiripa-cartel-imagen">
        <img
          src={CARTEL_IMAGEN}
          alt={`Cartel oficial de ${FESTIVAL.titulo}: ${CARTEL.map((a) => a.nombre).join(", ")}`}
          width={880}
          height={1218}
        />
      </div>

      <p className="chiripa-nota">
        {FESTIVAL.fechas} · {FESTIVAL.lugar}, {FESTIVAL.ciudad}
      </p>
    </Hoja>
  );
}
