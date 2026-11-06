"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  dibujarDifuminada,
  cargarImagen,
  esperarFuentes,
  rutaRedondeada,
  textoAjustado,
} from "@/lib/lienzo";
import { baloo, caveman } from "@/lib/fuentes";
import { FESTIVAL, sitioActual } from "@/lib/festival";
import { PORTADA_PLACEHOLDER, type Cancion } from "@/lib/radio";
import { Hoja } from "./Hoja";

function dibujarPortada(
  ctx: CanvasRenderingContext2D,
  imagen: HTMLImageElement,
  x: number,
  y: number,
  ancho: number,
  alto: number,
) {
  const escala = Math.max(ancho / imagen.width, alto / imagen.height);
  const w = imagen.width * escala;
  const h = imagen.height * escala;
  ctx.drawImage(imagen, x + (ancho - w) / 2, y + (alto - h) / 2, w, h);
}

export function HojaHistoria({
  abierto,
  alCerrar,
  cancion,
}: {
  abierto: boolean;
  alCerrar: () => void;
  cancion: Cancion | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const [lista, setLista] = useState(false);

  const dibujar = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1920;
    const CREMA = "#f2e4c6";
    const ROJO_VIVO = "#ff453a";
    const familia = `${baloo.style.fontFamily}, sans-serif`;
    const familiaCueva = `${caveman.style.fontFamily}, ${familia}`;
    const alAire = !!(cancion && cancion.titulo);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#241510";
    ctx.fillRect(0, 0, W, H);
    const portada = alAire ? await cargarImagen(cancion?.portada ?? "") : null;
    if (portada) {
      dibujarDifuminada(ctx, portada, -140, -140, W + 280, H + 280);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, W, H);
    }

    await esperarFuentes(
      [
        `400 120px ${familiaCueva}`,
        `700 62px ${familia}`,
        `600 32px ${familia}`,
        `500 36px ${familia}`,
      ],
      familia,
    );

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = alAire ? ROJO_VIVO : "#c2c2c4";
    ctx.beginPath();
    ctx.arc(104, 160, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 30px ${familia}`;
    ctx.fillText(alAire ? "EN VIVO" : "TU FRECUENCIA", 128, 172);

    ctx.fillStyle = CREMA;
    {
      /* Caveman dibuja muy grande: se parte de un tamaño más contenido
         y se ajusta a lo ancho por si la palabra creciera. */
      let size = 96;
      ctx.font = `400 ${size}px ${familiaCueva}`;
      while (ctx.measureText("Chiripa").width > 640 && size > 44) {
        size -= 4;
        ctx.font = `400 ${size}px ${familiaCueva}`;
      }
      ctx.fillText("Chiripa", 90, 336);
    }
    ctx.fillStyle = "rgba(242, 228, 198, 0.92)";
    ctx.font = `700 48px ${familia}`;
    ctx.fillText("RADIO CHIRIPA", 90, 428);

    ctx.strokeStyle = "rgba(242, 228, 198, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, 478);
    ctx.lineTo(990, 478);
    ctx.stroke();

    const imagenCard = portada ?? (await cargarImagen(PORTADA_PLACEHOLDER));
    ctx.save();
    rutaRedondeada(ctx, 120, 570, 840, 840, 24);
    ctx.clip();
    if (imagenCard) {
      dibujarPortada(ctx, imagenCard, 120, 570, 840, 840);
    } else {
      ctx.fillStyle = "#3a2a20";
      ctx.fillRect(120, 570, 840, 840);
    }
    ctx.restore();

    ctx.fillStyle = "#f7ead2";
    textoAjustado(
      ctx,
      alAire ? cancion!.titulo : "Sintoniza la radio",
      120,
      1512,
      840,
      52,
      familia,
      700,
    );
    ctx.fillStyle = "rgba(242, 228, 198, 0.75)";
    textoAjustado(
      ctx,
      alAire ? cancion!.artista || "Chiripa Radio" : "Chiripa Radio",
      120,
      1580,
      840,
      34,
      familia,
      500,
    );

    ctx.fillStyle = "rgba(242, 228, 198, 0.78)";
    ctx.font = `600 32px ${familia}`;
    ctx.fillText("SINTONIZA", 90, 1710);
    let textoSitio = sitioActual();
    try {
      const u = new URL(textoSitio);
      textoSitio = u.hostname + u.pathname.replace(/\/$/, "");
    } catch {
      /* sin URL legible: se muestra tal cual */
    }
    ctx.fillStyle = CREMA;
    textoAjustado(ctx, textoSitio, 90, 1772, 900, 42, familia, 600);

    setLista(true);
  }, [cancion]);

  useEffect(() => {
    if (abierto) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          dibujar();
        });
      });
    }
  }, [abierto, dibujar]);

  function nombreArchivo() {
    return `chiripa-${FESTIVAL.edicion.replace(" ", "-").toLowerCase()}-historia.png`;
  }

  function guardar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo();
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  async function compartirImagen() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof navigator !== "undefined" && "canShare" in navigator) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) return;
      const archivo = new File([blob], nombreArchivo(), { type: "image/png" });
      if (navigator.canShare({ files: [archivo] })) {
        try {
          const suena =
            cancion && cancion.titulo
              ? ` Ahora suena ${cancion.titulo}${cancion.artista ? ` de ${cancion.artista}` : ""}.`
              : "";
          await navigator.share({
            files: [archivo],
            title: "Chiripa Festival De Música y Arte",
            text: `Chiripa 2026 · ${FESTIVAL.fechas}.${suena} ${sitioActual()}`,
          });
          return;
        } catch {
          /* cancelado */
        }
      }
    }
    toast({
      title: "Compartir no disponible",
      description: "Guarda la imagen y súbela a tu historia.",
    });
  }

  return (
    <Hoja
      id="hojaHistoria"
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Historia de Instagram"
      subtitulo={`${FESTIVAL.titulo} · ${FESTIVAL.fechas}`}
      etiqueta="Generador de historia de Instagram"
      pie={
        <div className="chiripa-historia-acciones">
          <button className="chiripa-accion" type="button" onClick={guardar}>
            <Download aria-hidden="true" />
            Guardar
          </button>
          <button className="chiripa-accion chiripa-accion-destacada" type="button" onClick={compartirImagen}>
            <Share2 aria-hidden="true" />
            Compartir
          </button>
        </div>
      }
    >
      <div className="chiripa-historia-vista">
        <canvas
          ref={canvasRef}
          width={1080}
          height={1920}
          role="img"
          aria-label={
            cancion && cancion.titulo
              ? `Historia de Instagram: Ahora suena ${cancion.titulo}${cancion.artista ? ` de ${cancion.artista}` : ""} en Chiripa Radio`
              : `Historia de Instagram del Festival Chiripa: ${FESTIVAL.fechas}, ${FESTIVAL.lugar}, ${FESTIVAL.ciudad}`
          }
        />
      </div>
      {!lista ? (
        <p className="chiripa-social-estado" role="status">
          Dibujando la historia…
        </p>
      ) : null}
    </Hoja>
  );
}
