"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Copy, Instagram, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FESTIVAL, MENSAJE_COMPARTIR, sitioActual } from "@/lib/festival";
import type { Cancion } from "@/lib/radio";
import { Hoja } from "./Hoja";

export function HojaCompartir({
  abierto,
  alCerrar,
  alHistoria,
  cancion,
}: {
  abierto: boolean;
  alCerrar: () => void;
  alHistoria: () => void;
  cancion: Cancion | null;
}) {
  const { toast } = useToast();
  const [estado, setEstado] = useState("");
  const sitio = useSyncExternalStore(
    () => () => {},
    () => sitioActual(),
    () => "",
  );

  const suena =
    cancion && cancion.titulo
      ? ` Ahora suena ${cancion.titulo}${cancion.artista ? ` de ${cancion.artista}` : ""}.`
      : "";
  const texto = `${MENSAJE_COMPARTIR}${suena}`;
  const mensaje = sitio ? `${texto}\n${sitio}` : texto;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setEstado("Mensaje copiado");
      toast({ title: "Copiado", description: "El mensaje ya está en tu portapapeles." });
    } catch {
      setEstado("No se pudo copiar en este navegador");
    }
  }

  async function compartirNativo() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Chiripa Festival De Música y Arte",
          text: texto,
          url: sitio || undefined,
        });
        setEstado("¡Gracias por compartir!");
      } catch {
        /* el usuario canceló */
      }
    } else {
      setEstado("Compartir nativo no disponible — usa X o Instagram");
    }
  }

  const intent = new URL("https://twitter.com/intent/tweet");
  intent.searchParams.set("text", texto);
  if (sitio) intent.searchParams.set("url", sitio);

  return (
    <Hoja
      id="hojaCompartir"
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Comparte la frecuencia"
      subtitulo={`${FESTIVAL.nombre} · ${FESTIVAL.subtitulo}`}
      etiqueta="Compartir el festival"
    >
      <p className="chiripa-compartir-mensaje">{mensaje}</p>

      <div className="chiripa-social-acciones">
        <a className="chiripa-accion" href={intent.href} target="_blank" rel="noopener">
          X / Twitter
          <ArrowUpRight aria-hidden="true" />
        </a>
        <button className="chiripa-accion" type="button" onClick={alHistoria}>
          <Instagram aria-hidden="true" />
          Historia de Instagram
        </button>
        <button className="chiripa-accion" type="button" onClick={copiar}>
          <Copy aria-hidden="true" />
          Copiar mensaje
        </button>
        <button className="chiripa-accion" type="button" onClick={compartirNativo}>
          <Share2 aria-hidden="true" />
          Más opciones
        </button>
      </div>

      <p className="chiripa-social-estado" role="status">
        {estado}
      </p>
    </Hoja>
  );
}
