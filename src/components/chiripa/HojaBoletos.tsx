"use client";

import { ArrowUpRight, MessageCircle } from "lucide-react";
import { FESTIVAL } from "@/lib/festival";
import { Hoja } from "./Hoja";

export function HojaBoletos({
  abierto,
  alCerrar,
}: {
  abierto: boolean;
  alCerrar: () => void;
}) {
  return (
    <Hoja
      id="hojaBoletos"
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Boletos"
      subtitulo={`${FESTIVAL.fase} · Passline o DM`}
      etiqueta="Boletos del festival"
      pie={
        <>
          <a
            className="chiripa-accion chiripa-accion-destacada"
            href={FESTIVAL.passlineUrl}
            target="_blank"
            rel="noopener"
          >
            Comprar en Passline
            <ArrowUpRight aria-hidden="true" />
          </a>
          <a
            className="chiripa-accion"
            href={FESTIVAL.instagramDM}
            target="_blank"
            rel="noopener"
          >
            <MessageCircle aria-hidden="true" />
            Escribir por DM · {FESTIVAL.instagramArroba}
          </a>
        </>
      }
    >
      <div className="chiripa-boletos-fase">
        <span className="chiripa-fase-punto" aria-hidden="true" />
        Fase 1 · En venta
      </div>

      <p className="chiripa-sobre-parrafo" style={{ marginTop: 16, textAlign: "center" }}>
        La primera tanda de boletos ya está disponible. Compra directa en
        Passline o escríbenos por Instagram para apartar la tuya.
      </p>

      <div className="chiripa-detalles">
        <div className="chiripa-detalle">
          <div>
            <small>Fecha</small>
            <strong>{FESTIVAL.fechas}</strong>
          </div>
        </div>
        <div className="chiripa-detalle">
          <div>
            <small>Sede</small>
            <strong>{FESTIVAL.lugar}</strong>
          </div>
        </div>
        <div className="chiripa-detalle">
          <div>
            <small>Dirección</small>
            <strong>{FESTIVAL.direccion}</strong>
          </div>
        </div>
      </div>
    </Hoja>
  );
}
