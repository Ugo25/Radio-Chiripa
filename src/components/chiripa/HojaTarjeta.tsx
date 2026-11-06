"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import {
  cargarImagen,
  dibujarDifuminada,
  esperarFuentes,
  rutaRedondeada,
  textoAjustado,
} from "@/lib/lienzo";
import { normalizarLetra } from "@/lib/letra-formato";
import { baloo, caveman } from "@/lib/fuentes";
import { sitioActual } from "@/lib/festival";
import { PORTADA_PLACEHOLDER, type Cancion } from "@/lib/radio";
import { Hoja } from "./Hoja";

const MAX_CARACTERES = 200;

const caracteres = (texto: string) => Array.from(texto).length;

function versosDe(lineas: string[]) {
  const versos: { texto: string; linea: number }[] = [];
  const limpias = normalizarLetra(lineas.join("\n")).split("\n");
  limpias.forEach((texto, i) => {
    const verso = texto.trim();
    const esSeccion = /^\[[^\]\d][^\]]*\]$/.test(verso) && verso.length <= 40;
    if (verso && !esSeccion) versos.push({ texto: verso, linea: i });
  });
  return versos;
}

function componer(
  versos: { texto: string; linea: number }[],
  lineas: string[],
  seleccion: Set<number>,
): string {
  let anterior: number | null = null;
  const partes: string[] = [];
  versos.forEach((verso, i) => {
    if (!seleccion.has(i)) return;
    const vacias =
      anterior === null
        ? 0
        : lineas.slice(anterior + 1, verso.linea).filter((l) => !l.trim()).length;
    partes.push((anterior === null ? "" : "\n".repeat(1 + vacias)) + verso.texto);
    anterior = verso.linea;
  });
  return partes.join("");
}

function cargarImagenL(url: string): Promise<HTMLImageElement | null> {
  return cargarImagen(url);
}

function envolver(ctx: CanvasRenderingContext2D, texto: string, ancho: number) {
  const filas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    if (!parrafo.trim()) {
      filas.push("");
      continue;
    }
    let fila = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = fila ? `${fila} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width <= ancho) {
        fila = prueba;
        continue;
      }
      if (fila) filas.push(fila);
      fila = "";
      for (const letra of Array.from(palabra)) {
        if (fila && ctx.measureText(fila + letra).width > ancho) {
          filas.push(fila);
          fila = "";
        }
        fila += letra;
      }
    }
    if (fila) filas.push(fila);
  }
  return filas;
}

export function HojaTarjeta({
  abierto,
  alCerrar,
  cancion,
  lineas,
}: {
  abierto: boolean;
  alCerrar: () => void;
  cancion: Cancion | null;
  lineas: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState("");
  const [pestana, setPestana] = useState<"elegir" | "ver">("elegir");

  const versos = versosDe(lineas);
  const fragmento = componer(versos, lineas, seleccion);
  const cuenta = caracteres(fragmento);

  useEffect(() => {
    if (!abierto) return;
    const iniciales = new Set<number>();
    for (let i = 0; i < versos.length; i++) {
      const siguiente = componer(versos, lineas, new Set([...iniciales, i]));
      if (caracteres(siguiente) > MAX_CARACTERES) continue;
      iniciales.add(i);
      if (iniciales.size >= 2) break;
    }
    setSeleccion(iniciales);
    setArchivo(null);
    setEstado("");
    setPestana("elegir");
  }, [abierto]);

  const alternarVerso = (i: number) => {
    setSeleccion((previa) => {
      const nueva = new Set(previa);
      if (nueva.has(i)) nueva.delete(i);
      else nueva.add(i);
      return nueva;
    });
    setArchivo(null);
    setEstado("");
  };

  const dibujar = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !abierto || !fragmento) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1350;
    const CREMA = "#f2e4c6";
    const ROJO_VIVO = "#ff453a";
    const familia = `${baloo.style.fontFamily}, sans-serif`;
    const familiaCueva = `${caveman.style.fontFamily}, ${familia}`;

    try {
      await esperarFuentes(
        [
          `400 62px ${familiaCueva}`,
          `700 76px ${familia}`,
          `700 31px ${familia}`,
          `600 18px ${familia}`,
          `500 28px ${familia}`,
        ],
        familia,
      );
      const imagen = await cargarImagenL(cancion?.portada ?? PORTADA_PLACEHOLDER);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#241510";
      ctx.fillRect(0, 0, W, H);
      if (imagen) {
        dibujarDifuminada(ctx, imagen, -140, -140, W + 280, H + 280);
        ctx.fillStyle = "rgba(36, 21, 16, 0.62)";
        ctx.fillRect(0, 0, W, H);
      }

      ctx.textBaseline = "alphabetic";

      // Cabecera: wordmark Chiripa + punto rojo y RADIO CHIRIPA a la derecha.
      ctx.fillStyle = CREMA;
      {
        let size = 62;
        ctx.font = `400 ${size}px ${familiaCueva}`;
        while (ctx.measureText("Chiripa").width > 580 && size > 30) {
          size -= 2;
          ctx.font = `400 ${size}px ${familiaCueva}`;
        }
        ctx.fillText("Chiripa", 76, 143);
      }
      ctx.font = `700 31px ${familia}`;
      const textoMarca = "RADIO CHIRIPA";
      const xMarca = 1004 - ctx.measureText(textoMarca).width;
      ctx.fillStyle = "rgba(242, 228, 198, 0.95)";
      ctx.fillText(textoMarca, xMarca, 133);
      ctx.fillStyle = ROJO_VIVO;
      ctx.beginPath();
      ctx.arc(xMarca - 27, 122, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(242, 228, 198, 0.2)";
      ctx.beginPath();
      ctx.moveTo(76, 196);
      ctx.lineTo(1004, 196);
      ctx.stroke();

      ctx.fillStyle = "rgba(242, 228, 198, 0.5)";
      ctx.font = "700 136px Georgia, serif";
      ctx.fillText("“", 69, 337);

      let size = 92;
      let filas: string[] = [];
      for (;;) {
        ctx.font = `700 ${size}px ${familia}`;
        filas = envolver(ctx, fragmento, 908);
        if (filas.length * size * 1.16 <= 590 || size <= 24) break;
        size -= 2;
      }
      ctx.fillStyle = "#f7ead2";
      filas.forEach((fila, i) => ctx.fillText(fila, 76, 398 + i * size * 1.16));

      ctx.save();
      rutaRedondeada(ctx, 76, 1000, 128, 128, 14);
      ctx.clip();
      if (imagen) {
        const escala = Math.max(128 / imagen.width, 128 / imagen.height);
        const w = imagen.width * escala;
        const h = imagen.height * escala;
        ctx.drawImage(imagen, 76 + (128 - w) / 2, 1000 + (128 - h) / 2, w, h);
      } else {
        ctx.fillStyle = "#3a2a20";
        ctx.fillRect(76, 1000, 128, 128);
      }
      ctx.restore();
      ctx.fillStyle = CREMA;
      textoAjustado(ctx, cancion?.titulo ?? "Chiripa Radio", 234, 1052, 770, 36, familia, 700);
      ctx.fillStyle = "rgba(242, 228, 198, 0.7)";
      textoAjustado(
        ctx,
        cancion?.artista || "Festival De Música y Arte",
        234,
        1097,
        770,
        28,
        familia,
        500,
      );

      ctx.strokeStyle = "rgba(242, 228, 198, 0.2)";
      ctx.beginPath();
      ctx.moveTo(76, 1180);
      ctx.lineTo(1004, 1180);
      ctx.stroke();
      ctx.fillStyle = "rgba(242, 228, 198, 0.78)";
      ctx.font = `600 17px ${familia}`;
      ctx.fillText("SINTONIZA LA RADIO", 76, 1230);
      const sitio = sitioActual();
      let textoSitio = sitio;
      try {
        const u = new URL(sitio);
        textoSitio = u.hostname + u.pathname.replace(/\/$/, "");
      } catch {
        /* sin URL legible: se muestra tal cual */
      }
      ctx.fillStyle = CREMA;
      textoAjustado(ctx, textoSitio, 76, 1272, 928, 28, familia, 600);

      canvas.setAttribute(
        "aria-label",
        `${fragmento} · ${cancion?.titulo ?? "Chiripa Radio"} · Radio Chiripa`,
      );

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) {
        setEstado("No se pudo crear la imagen. Intenta de nuevo.");
        return;
      }
      const slug =
        (cancion?.titulo ?? "chiripa")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "chiripa";
      setArchivo(new File([blob], `chiripa-tarjeta-${slug}.png`, { type: "image/png" }));
      setEstado(imagen ? "" : "La portada no está disponible. Tu tarjeta se puede guardar igualmente.");
    } catch {
      setEstado("No se pudo crear la imagen. Intenta de nuevo.");
    }
  }, [abierto, fragmento, cancion]);

  useEffect(() => {
    if (!abierto || pestana !== "ver") return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => dibujar()));
    return () => cancelAnimationFrame(raf);
  }, [abierto, pestana, dibujar]);

  function guardar() {
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function compartir() {
    if (!archivo) return;
    const datos = {
      files: [archivo],
      title: `${cancion?.titulo ?? "Chiripa Radio"} · Radio Chiripa`,
      text: `Radio Chiripa. ${sitioActual()}`,
    };
    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: datos.files })
    ) {
      try {
        await navigator.share(datos);
        return;
      } catch {
        /* cancelado */
      }
    }
    guardar();
    setEstado("Tarjeta descargada. Ya puedes adjuntarla en Instagram o X.");
  }

  return (
    <Hoja
      id="hojaTarjeta"
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Tarjeta de la letra"
      subtitulo="Elige versos y comparte"
      portada={cancion?.portada ?? PORTADA_PLACEHOLDER}
      etiqueta="Crear tarjeta de la letra"
      pie={
        <div className="chiripa-historia-acciones">
          <button className="chiripa-accion" type="button" onClick={guardar} disabled={!archivo}>
            <Download aria-hidden="true" />
            Guardar
          </button>
          <button
            className="chiripa-accion chiripa-accion-destacada"
            type="button"
            onClick={compartir}
            disabled={!archivo}
          >
            <Share2 aria-hidden="true" />
            Compartir
          </button>
        </div>
      }
    >
      <div className="chiripa-tarjeta-tabs" role="tablist" aria-label="Secciones de la tarjeta">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "elegir"}
          className={pestana === "elegir" ? "chiripa-tab-activa" : undefined}
          onClick={() => setPestana("elegir")}
        >
          Elegir versos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "ver"}
          className={pestana === "ver" ? "chiripa-tab-activa" : undefined}
          onClick={() => setPestana("ver")}
        >
          Ver la tarjeta
        </button>
      </div>

      {pestana === "elegir" ? (
        <>
          <div className="chiripa-tarjeta-barra">
            <span className="chiripa-tarjeta-contador">{`${cuenta} / ${MAX_CARACTERES}`}</span>
            <button
              className="chiripa-tarjeta-limpiar"
              type="button"
              onClick={() => {
                setSeleccion(new Set());
                setArchivo(null);
                setEstado("");
              }}
            >
              Limpiar
            </button>
          </div>

          <div className="chiripa-versos" role="group" aria-label="Versos de la letra">
            {versos.map((verso, i) => {
              const siguiente = componer(versos, lineas, new Set([...seleccion, i]));
              const cupo =
                seleccion.has(i) || caracteres(siguiente) <= MAX_CARACTERES;
              return (
                <button
                  key={i}
                  type="button"
                  className="chiripa-verso"
                  aria-pressed={seleccion.has(i)}
                  disabled={!cupo}
                  onClick={() => alternarVerso(i)}
                >
                  <span>{verso.texto}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="chiripa-tarjeta-vista">
          <canvas
            ref={canvasRef}
            width={1080}
            height={1350}
            role="img"
            aria-label="Vista previa de la tarjeta de la letra"
          />
        </div>
      )}

      <p className="chiripa-social-estado" role="status">
        {estado}
      </p>
    </Hoja>
  );
}
