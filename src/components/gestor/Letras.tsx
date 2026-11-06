"use client";

import { useState } from "react";
import { FileText, Loader2, MessageSquareText, Search } from "lucide-react";
import { pedirGestor } from "./api";
import { EditorLetra } from "./EditorLetra";
import { iniciales, type AlbumPanel, type Cancion } from "./tipos";

export function Letras({
  canciones,
  albumes,
  onRefrescar,
  onDesconexion,
}: {
  canciones: Cancion[];
  albumes: AlbumPanel[];
  onRefrescar: () => void;
  onDesconexion: () => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  const conLetra = canciones.filter((c) => c.conLetra);
  const sinLetra = canciones.filter((c) => !c.conLetra);
  const total = canciones.length;
  const porcentaje = total ? Math.round((conLetra.length / total) * 100) : 0;

  const buscarLetras = async () => {
    setBuscando(true);
    setInfo("");
    setError("");
    const res = await pedirGestor("/api/biblioteca/letras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    setBuscando(false);
    if (!res) {
      onDesconexion();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      resumen?: {
        nuevas: number;
        conLetra: number;
        sinLetra: number;
        restantes: number;
      };
    } | null;
    const r = data?.resumen;
    if (!r) {
      setError("No se pudo completar la búsqueda.");
      return;
    }
    const partes = [
      `${r.nuevas} letra${r.nuevas === 1 ? "" : "s"} nueva${r.nuevas === 1 ? "" : "s"}`,
      `${r.conLetra} ya tenían`,
      `${r.sinLetra} sin letra (se reintentan luego)`,
    ];
    if (r.restantes) {
      partes.push(`${r.restantes} pendiente${r.restantes === 1 ? "" : "s"} — toca de nuevo`);
    }
    setInfo(`Letras: ${partes.join(" · ")}.`);
    onRefrescar();
  };

  const fila = (cancion: Cancion) => {
    const album = albumes.find((a) => a.id === cancion.albumId);
    return (
      <li key={cancion.id} className="panel-letra-fila">
        <button
          type="button"
          className="panel-letra-boton"
          onClick={() => setAbierta(abierta === cancion.id ? null : cancion.id)}
          aria-expanded={abierta === cancion.id}
        >
          <span className="panel-letra-portada" aria-hidden="true">
            {cancion.portada ? (
              <img src={cancion.portada} alt="" width={40} height={40} />
            ) : (
              <span className="panel-ultima-iniciales">{iniciales(cancion.titulo)}</span>
            )}
          </span>
          <span className="panel-ultima-datos">
            <span className="panel-ultima-titulo">{cancion.titulo}</span>
            <span className="panel-ultima-meta">
              {cancion.artista}
              {album ? ` · ${album.nombre}` : ""}
            </span>
            {cancion.instrumental ? (
              <span className="panel-marca panel-marca-instrumental">Instrumental</span>
            ) : cancion.conLetra ? (
              <span className="panel-marca panel-marca-si">Con letra</span>
            ) : null}
          </span>
        </button>
        {abierta === cancion.id ? (
          <EditorLetra
            cancion={cancion}
            onCerrar={() => setAbierta(null)}
            onGuardada={() => {
              setAbierta(null);
              onRefrescar();
            }}
            onDesconexion={onDesconexion}
          />
        ) : null}
      </li>
    );
  };

  return (
    <div className="panel-letras">
      <section className="panel-tarjeta">
        <div className="panel-letras-cifras">
          <div className="panel-letras-cifra">
            <span className="panel-letras-cifra-numero">{conLetra.length}</span>
            <span>con letra</span>
          </div>
          <div className="panel-letras-cifra">
            <span className="panel-letras-cifra-numero">{sinLetra.length}</span>
            <span>sin letra</span>
          </div>
          <div className="panel-letras-cifra">
            <span className="panel-letras-cifra-numero">{porcentaje}%</span>
            <span>cubiertas</span>
          </div>
          <button
            className="panel-boton panel-boton-primario"
            type="button"
            onClick={() => void buscarLetras()}
            disabled={buscando || !total}
            title="Busca en LRCLIB las letras que falten y las guarda"
          >
            {buscando ? (
              <Loader2 className="panel-girando" aria-hidden="true" />
            ) : (
              <Search aria-hidden="true" />
            )}
            {buscando ? "Buscando…" : "Buscar en LRCLIB"}
          </button>
        </div>
        <div className="panel-letras-barra" role="img" aria-label={`${porcentaje}% de las canciones tienen letra`}>
          <span style={{ width: `${porcentaje}%` }} />
        </div>
        {info ? (
          <p className="panel-letras-info" role="status">
            {info}
          </p>
        ) : null}
        {error ? (
          <p className="panel-aviso-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="panel-tarjeta" aria-label="Canciones sin letra">
        <h2 className="panel-tarjeta-titulo">
          <FileText aria-hidden="true" />
          Sin letra ({sinLetra.length})
        </h2>
        <p className="panel-tarjeta-sub">
          Pega la letra a mano: la radio la mostrará con la canción.
        </p>
        {sinLetra.length ? (
          <ul className="panel-letras-lista">{sinLetra.map(fila)}</ul>
        ) : (
          <p className="panel-vacio-chico">
            {total
              ? "Toda la biblioteca tiene letra. Impecable."
              : "Todavía no hay canciones en la biblioteca."}
          </p>
        )}
      </section>

      {conLetra.length ? (
        <section className="panel-tarjeta" aria-label="Canciones con letra">
          <h2 className="panel-tarjeta-titulo">
            <MessageSquareText aria-hidden="true" />
            Con letra ({conLetra.length})
          </h2>
          <p className="panel-tarjeta-sub">Toca cualquier canción para revisar o corregir.</p>
          <ul className="panel-letras-lista">{conLetra.map(fila)}</ul>
        </section>
      ) : null}
    </div>
  );
}
