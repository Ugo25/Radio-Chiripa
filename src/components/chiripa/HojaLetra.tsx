"use client";

import { Music4 } from "lucide-react";
import { Image as Imagen } from "lucide-react";
import { normalizarLetra } from "@/lib/letra-formato";
import { apiConectada, PORTADA_PLACEHOLDER, TEXTOS, type Cancion } from "@/lib/radio";
import { Hoja } from "./Hoja";

export function HojaLetra({
  abierto,
  alCerrar,
  cancion,
  lineas,
  cargando,
  instrumental,
  alTarjeta,
}: {
  abierto: boolean;
  alCerrar: () => void;
  cancion: Cancion | null;
  lineas: string[] | null;
  cargando: boolean;
  instrumental: boolean;
  alTarjeta: () => void;
}) {
  const titulo = cancion?.titulo ?? TEXTOS.sinCancionTitulo;
  const artista = cancion?.artista ?? TEXTOS.sinCancionArtista;
  const portada = cancion?.portada ?? PORTADA_PLACEHOLDER;
    // Red de seguridad: la letra ya llega normalizada del servidor.
  const limpias = lineas ? normalizarLetra(lineas.join("\n")).split("\n") : null;
  const hayLetra = !!limpias && limpias.some((l) => l.trim());

  const esSeccion = (linea: string) =>
    /^\[[^\]\d][^\]]*\]$/.test(linea.trim()) && linea.trim().length <= 40;

  return (
    <Hoja
      id="hojaLetra"
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={titulo}
      subtitulo={artista}
      portada={portada}
      etiqueta="Letra de la canción sonando"
      pie={
        hayLetra ? (
          <button
            className="chiripa-accion chiripa-accion-destacada"
            type="button"
            onClick={alTarjeta}
            aria-haspopup="dialog"
          >
            <Imagen aria-hidden="true" />
            Crear tarjeta de la letra
          </button>
        ) : null
      }
    >
      {cargando ? (
        <p className="chiripa-letra chiripa-letra-vacia">{TEXTOS.letraCargando}</p>
      ) : instrumental ? (
        <p className="chiripa-letra chiripa-letra-vacia chiripa-letra-instrumental">
          <Music4 aria-hidden="true" />
          {TEXTOS.letraInstrumental}
        </p>
      ) : hayLetra ? (
        <div className="chiripa-letra">
          {limpias.map((linea, i) => {
            if (esSeccion(linea)) {
              return (
                <p key={i} className="chiripa-letra-seccion">
                  {linea.trim().slice(1, -1)}
                </p>
              );
            }
            return <p key={i}>{linea.trim() === "" ? "\u00A0" : linea}</p>;
          })}
        </div>
      ) : (
        <p className="chiripa-letra chiripa-letra-vacia">
          {apiConectada() ? TEXTOS.letraNoDisponible : TEXTOS.letraEsperando}
        </p>
      )}
    </Hoja>
  );
}
