"use client";

import { useEffect, useState } from "react";
import { PuertaBiblioteca, PuertaEspera } from "@/components/chiripa/PuertaBiblioteca";
import { cabeceraLlave } from "@/lib/llave-cliente";

// La puerta del panel vive aquí. Quien ya trae llave pasa directo a /gestor;
// quien no, se identifica con PIN o cuenta y al entrar lo llevamos al panel.
export default function PaginaAcceso() {
  const [estado, setEstado] = useState<"revisando" | "afuera">("revisando");

  useEffect(() => {
    fetch("/api/biblioteca/sesion", { cache: "no-store", headers: cabeceraLlave() })
      .then((r) => r.json())
      .then((d: { conectado?: boolean }) => {
        if (d.conectado) window.location.replace("/gestor");
        else setEstado("afuera");
      })
      .catch(() => setEstado("afuera"));
  }, []);

  if (estado === "revisando") {
    return <PuertaEspera texto="Abriendo la puerta…" />;
  }

  return (
    <PuertaBiblioteca
      titulo="Panel de Radio Chiripa"
      subtitulo="El control de toda la radio: biblioteca, álbumes, letras y cuentas. Entra con el PIN del dueño o con tu cuenta."
      alEntrar={() => window.location.replace("/gestor")}
    />
  );
}
