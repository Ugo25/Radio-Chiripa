"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, FileUp, Loader2, Music4, X } from "lucide-react";
import { normalizarLetra, parecePlantillaSinRellenar } from "@/lib/letra-formato";
import { pedirGestor } from "./api";
import type { Cancion } from "./tipos";

// Formato de entrega: al guardar, el molde quita secciones, título y marcas .lrc.
export const PLANTILLA_LETRA = `[Título de la canción — esto es un ejemplo]
[Coro]

Escribe aquí la letra de la canción
Un verso por línea

(Las líneas vacías separan las estrofas)

[Verso 1]

Si tu archivo es .lrc sincronizado no hay problema:
[00:12.40] las marcas de tiempo se quitan solas

[Instrumental] → usa el interruptor de abajo, no lo escribas aquí`;

export function letraDesdeArchivo(texto: string): string {
  return normalizarLetra(texto);
}

export function EditorLetra({
  cancion,
  onCerrar,
  onGuardada,
  onDesconexion,
}: {
  cancion: Cancion;
  onCerrar: () => void;
  onGuardada: () => void;
  onDesconexion: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const entradaArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fetch(
      `/api/radio/tracks/${encodeURIComponent(`biblio:${cancion.id}`)}/lyrics`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { lyrics?: string; instrumental?: boolean } | null) => {
        if (!vivo) return;
        setTexto(data?.lyrics ?? "");
        setInstrumental(data?.instrumental === true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [cancion.id]);

  const cargarArchivo = (archivo: File) => {
    if (archivo.size > 512 * 1024) {
      setError("Ese archivo pasa de 512 KB: parece demasiado grande para una letra.");
      return;
    }
    archivo
      .text()
      .then((crudo) => {
        if (parecePlantillaSinRellenar(crudo)) {
          setError(
            "Ese archivo es la plantilla sin rellenar: escribe la letra encima de los ejemplos y vuelve a subirlo.",
          );
          return;
        }
        const letra = letraDesdeArchivo(crudo);
        if (!letra) {
          setError("El archivo vino vacío o sin líneas de letra.");
          return;
        }
        setTexto(letra);
        setInstrumental(false);
        setError("");
      })
      .catch(() => setError("No se pudo leer el archivo."));
  };

  const alPegar = (evento: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const crudo = evento.clipboardData.getData("text/plain");
    if (!crudo) return;
    evento.preventDefault();
    const caja = evento.currentTarget;
    const inicio = caja.selectionStart;
    const fin = caja.selectionEnd;
    const actual = texto;
    const limpio = normalizarLetra(crudo);
    const nuevo = actual.slice(0, inicio) + limpio + actual.slice(fin);
    setTexto(nuevo);
    if (instrumental) setInstrumental(false);
    setError("");
    requestAnimationFrame(() => {
      caja.selectionStart = caja.selectionEnd = inicio + limpio.length;
    });
  };

  const descargarPlantilla = () => {
    const blob = new Blob([PLANTILLA_LETRA], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla-letra-chiripa.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const textoLimpio = normalizarLetra(texto);
    if (textoLimpio !== texto) setTexto(textoLimpio);
    if (!instrumental && parecePlantillaSinRellenar(texto)) {
      setGuardando(false);
      setError(
        "Eso es la plantilla de ejemplo, no una letra: escribe la letra de verdad y guarda de nuevo.",
      );
      return;
    }
    // Sin texto y sin instrumental también es válido: la canción queda sin letra.
    const cuerpo = instrumental
      ? { id: cancion.id, instrumental: true }
      : { id: cancion.id, letra: textoLimpio };
    const res = await pedirGestor("/api/biblioteca/letras", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    setGuardando(false);
    if (!res) {
      onDesconexion();
      return;
    }
    if (!res.ok) {
      setError("No se pudo guardar la letra. Intenta de nuevo.");
      return;
    }
    onGuardada();
  };

  return (
    <div className="panel-letra-editor">
      <p className="panel-letra-guia">
        {cancion.conLetra && !cancion.instrumental
          ? "Esta canción ya tiene letra: corrígela, pégala de nuevo o bórrala guardando sin texto."
          : "Pega la letra, sube un archivo .txt o .lrc, márcala como instrumental o déjala sin letra."}
      </p>

      <label className={`panel-letra-instrumental${instrumental ? " panel-letra-instrumental-si" : ""}`}>
        <input
          type="checkbox"
          checked={instrumental}
          onChange={(e) => setInstrumental(e.target.checked)}
          disabled={guardando}
        />
        <Music4 aria-hidden="true" />
        <span>
          <strong>Sin letra (instrumental)</strong>
          <small>
            La radio mostrará “Instrumental” y no se buscará en LRCLIB. Si solo
            la quieres sin letra, deja el interruptor apagado y guarda la caja
            vacía.
          </small>
        </span>
      </label>

      {cargando ? (
        <p className="panel-espera-linea">
          <Loader2 className="panel-girando" aria-hidden="true" />
          Cargando la letra actual…
        </p>
      ) : (
        <>
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (instrumental) setInstrumental(false);
            }}
            onPaste={alPegar}
            placeholder={
              "[Verso 1]\nEscribe aquí la letra — un verso por línea…\n\n[Coro]\nLas líneas vacías separan estrofas."
            }
            rows={8}
            disabled={guardando || instrumental}
            aria-label={`Letra de ${cancion.titulo}`}
            className={instrumental ? "panel-letra-apagada" : undefined}
          />

          <p className="panel-letra-formato">
            <strong>Formato:</strong> la plantilla (<code>[Coro]</code>, <code>[Verso 1]</code>,
            el título entre corchetes) es de entrega — al guardar se quita todo eso y solo
            queda la letra, como las de LRCLIB · las marcas <code>[00:14.32]</code> de un .lrc
            se quitan solas · la línea vacía separa estrofas.
          </p>

          <div className="panel-letra-herramientas">
            <input
              ref={entradaArchivo}
              type="file"
              accept=".txt,.lrc,text/plain"
              className="panel-entrada-oculta"
              onChange={(e) => {
                if (e.target.files?.[0]) cargarArchivo(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <button
              className="panel-boton"
              type="button"
              onClick={() => entradaArchivo.current?.click()}
              disabled={guardando || instrumental}
            >
              <FileUp aria-hidden="true" />
              Subir .txt / .lrc
            </button>
            <button
              className="panel-boton"
              type="button"
              onClick={descargarPlantilla}
              disabled={guardando}
            >
              <Download aria-hidden="true" />
              Plantilla de ejemplo
            </button>
          </div>

          {error ? (
            <p className="panel-aviso-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="panel-letra-acciones">
            <button
              className="panel-boton panel-boton-primario"
              type="button"
              onClick={() => void guardar()}
              disabled={guardando}
            >
              {guardando ? (
                <Loader2 className="panel-girando" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {instrumental
                ? "Marcar sin letra"
                : texto.trim()
                  ? "Guardar letra"
                  : "Guardar sin letra"}
            </button>
            <button
              className="panel-boton"
              type="button"
              onClick={onCerrar}
              disabled={guardando}
            >
              <X aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
