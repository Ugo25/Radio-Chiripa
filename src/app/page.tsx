"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Encabezado } from "@/components/chiripa/Encabezado";
import { ReproductorRadio } from "@/components/chiripa/ReproductorRadio";
import { FESTIVAL } from "@/lib/festival";
import { useLetra, useOyentes, useRadio } from "@/lib/radio";
import { PORTADA_PLACEHOLDER } from "@/lib/radio";
import type { Red } from "@/lib/redes-compartir";

// Las hojas con canvas se cargan bajo demanda: la radio abre con el mínimo JS.
const HojaLetra = dynamic(() =>
  import("@/components/chiripa/HojaLetra").then((m) => m.HojaLetra),
);
const HojaTarjeta = dynamic(() =>
  import("@/components/chiripa/HojaTarjeta").then((m) => m.HojaTarjeta),
);
const HojaCartel = dynamic(() =>
  import("@/components/chiripa/HojaCartel").then((m) => m.HojaCartel),
);
const HojaSobre = dynamic(() =>
  import("@/components/chiripa/HojaSobre").then((m) => m.HojaSobre),
);
const HojaBoletos = dynamic(() =>
  import("@/components/chiripa/HojaBoletos").then((m) => m.HojaBoletos),
);
const HojaCompartir = dynamic(() =>
  import("@/components/chiripa/HojaCompartir").then((m) => m.HojaCompartir),
);
const HojaHistoria = dynamic(() =>
  import("@/components/chiripa/HojaHistoria").then((m) => m.HojaHistoria),
);

type HojaAbierta =
  | "letra"
  | "tarjeta"
  | "cartel"
  | "sobre"
  | "boletos"
  | "compartir"
  | "historia"
  | null;

function FondoDinamico({ portada }: { portada?: string }) {
  const [capas, setCapas] = useState<string[]>([PORTADA_PLACEHOLDER]);

  useEffect(() => {
    const nueva = portada ?? PORTADA_PLACEHOLDER;
    let cancelado = false;
    const img = new Image();
    img.onload = () => {
      if (cancelado) return;
      setCapas((c) => (c[c.length - 1] === nueva ? c : [...c, nueva].slice(-3)));
    };
    img.onerror = () => {};
    img.src = nueva;
    return () => {
      cancelado = true;
    };
  }, [portada]);

  const ultima = capas.length - 1;
  return (
    <div className="chiripa-fondo" aria-hidden="true">
      {capas.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className={`chiripa-fondo-capa${i === ultima && i > 0 ? " chiripa-fondo-entra" : ""}`}
          style={{ backgroundImage: `url(${url})` }}
          onAnimationEnd={() => {
            if (i === ultima) setCapas((c) => c.slice(-1));
          }}
        />
      ))}
    </div>
  );
}

export default function Page() {
  const [hoja, setHoja] = useState<HojaAbierta>(null);
  const [redes, setRedes] = useState<Red[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/radio/redes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { redes?: Red[] } | null) => {
        if (vivo && Array.isArray(d?.redes)) setRedes(d.redes);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const { cancion, sonando, transcurridoSeg, aviso, silencio, alternar, listo, iniciando } =
    useRadio();
  const espectadores = useOyentes();
  const { lineas, cargando, instrumental } = useLetra(cancion);

  const cerrar = (hojaActual: HojaAbierta) => () =>
    setHoja((h) => (h === hojaActual ? null : h));

  return (
    <main className="chiripa">
      <FondoDinamico portada={cancion?.portada} />

      <Encabezado alCompartir={() => setHoja("compartir")} redes={redes} />

      <ReproductorRadio
        cancion={cancion}
        sonando={sonando}
        transcurridoSeg={transcurridoSeg}
        espectadores={espectadores}
        aviso={aviso}
        silencio={silencio}
        listo={listo}
        iniciando={iniciando}
        alAlternar={alternar}
        alLetra={() => setHoja("letra")}
        alCartel={() => setHoja("cartel")}
        alSobre={() => setHoja("sobre")}
      />

      <footer className="chiripa-pie">
        Chiripa
        <span className="diamante" aria-hidden="true">
          ✦
        </span>
        Festival De Música y Arte
        <span className="diamante" aria-hidden="true">
          ✦
        </span>
        {FESTIVAL.fechas} · {FESTIVAL.lugar}, {FESTIVAL.ciudad}
      </footer>

      <HojaLetra
        abierto={hoja === "letra"}
        alCerrar={cerrar("letra")}
        cancion={cancion}
        lineas={lineas}
        cargando={cargando}
        instrumental={instrumental}
        alTarjeta={() => setHoja("tarjeta")}
      />
      {lineas && lineas.some((l) => l.trim()) ? (
        <HojaTarjeta
          abierto={hoja === "tarjeta"}
          alCerrar={cerrar("tarjeta")}
          cancion={cancion}
          lineas={lineas}
        />
      ) : null}
      <HojaCartel abierto={hoja === "cartel"} alCerrar={cerrar("cartel")} />
      <HojaSobre
        abierto={hoja === "sobre"}
        alCerrar={cerrar("sobre")}
        alBoletos={() => setHoja("boletos")}
        redes={redes}
      />
      <HojaBoletos abierto={hoja === "boletos"} alCerrar={cerrar("boletos")} />
      <HojaCompartir
        abierto={hoja === "compartir"}
        alCerrar={cerrar("compartir")}
        alHistoria={() => setHoja("historia")}
        cancion={cancion}
      />
      <HojaHistoria
        abierto={hoja === "historia"}
        alCerrar={cerrar("historia")}
        cancion={cancion}
      />
    </main>
  );
}
