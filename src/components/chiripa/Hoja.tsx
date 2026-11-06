"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Hoja({
  id,
  abierto,
  alCerrar,
  titulo,
  subtitulo,
  children,
  pie,
  etiqueta,
  portada,
}: {
  id: string;
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
  etiqueta?: string;
  portada?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (abierto && !dialog.open) {
      dialog.showModal();
    } else if (!abierto && dialog.open) {
      dialog.close();
    }
  }, [abierto]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const alTocar = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close();
    };
    dialog.addEventListener("click", alTocar);
    return () => dialog.removeEventListener("click", alTocar);
  }, []);

  const cerrar = useCallback(() => ref.current?.close(), []);

  return (
    <dialog
      ref={ref}
      id={id}
      className="chiripa-hoja"
      aria-label={etiqueta ?? titulo}
      onClose={alCerrar}
    >
      <div className="chiripa-hoja-cabecera">
        <img
          className="chiripa-hoja-portada"
          src={portada ?? "/chiripa-logo.jpg"}
          alt=""
          width={48}
          height={48}
        />
        <div className="chiripa-hoja-texto">
          <p className="chiripa-hoja-titulo">{titulo}</p>
          {subtitulo ? <p className="chiripa-hoja-artista">{subtitulo}</p> : null}
        </div>
        <button
          className="chiripa-hoja-cerrar"
          type="button"
          onClick={cerrar}
          aria-label={`Cerrar ${titulo.toLowerCase()}`}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="chiripa-hoja-cuerpo">{children}</div>
      {pie ? <div className="chiripa-hoja-pie">{pie}</div> : null}
    </dialog>
  );
}
