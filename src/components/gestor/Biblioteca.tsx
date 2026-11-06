"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronUp,
  ChevronsRight,
  FileText,
  Image,
  Loader2,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { cabeceraLlave } from "@/lib/llave-cliente";
import { pedirGestor } from "./api";
import { EditorLetra } from "./EditorLetra";
import { formatoDuracion, formatoTamano, normalizar, type AlbumPanel, type Cancion } from "./tipos";

export type FiltroAlbum = "todos" | "sueltas" | string;

type Subida = {
  nombre: string;
  progreso: number;
  estado: "subiendo" | "ok" | "error";
  detalle?: string;
};

const ACEPTADOS = ".mp3,.m4a,.mp4,.flac,.ogg,.opus,.wav,audio/*";
const PORTADA_GESTOR = "/chiripa-logo.jpg";
const POR_PAGINA = 10;

function paginasVisibles(actual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const juntas = new Set<number>([1, 2, actual - 1, actual, actual + 1, total - 1, total]);
  const lista: (number | "…")[] = [];
  let previa = 0;
  for (let n = 1; n <= total; n++) {
    if (juntas.has(n)) {
      if (previa && n - previa > 1) lista.push("…");
      lista.push(n);
      previa = n;
    }
  }
  return lista;
}

export function Biblioteca({
  canciones,
  albumes,
  albumFiltro,
  setAlbumFiltro,
  artistaFiltro,
  setArtistaFiltro,
  onRefrescar,
  onDesconexion,
}: {
  canciones: Cancion[];
  albumes: AlbumPanel[];
  albumFiltro: FiltroAlbum;
  setAlbumFiltro: (filtro: FiltroAlbum) => void;
  artistaFiltro: string | null;
  setArtistaFiltro: (artista: string | null) => void;
  onRefrescar: () => void;
  onDesconexion: () => void;
}) {
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  const subirArchivos = (archivos: FileList | File[]) => {
    const lista = Array.from(archivos).filter(
      (f) => f.size > 0 && f.size <= 60 * 1024 * 1024,
    );
    if (!lista.length) return;

    lista.forEach((archivo, i) => {
      setSubidas((s) => [...s, { nombre: archivo.name, progreso: 0, estado: "subiendo" }]);

      const forma = new FormData();
      forma.append("archivos", archivo);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/biblioteca");
      for (const [nombre, valor] of Object.entries(cabeceraLlave())) {
        xhr.setRequestHeader(nombre, valor);
      }
      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        const progreso = Math.round((e.loaded / e.total) * 100);
        setSubidas((s) =>
          s.map((u, j) => (j === s.length - lista.length + i ? { ...u, progreso } : u)),
        );
      });
      xhr.addEventListener("load", () => {
        let detalle = "";
        let estado: Subida["estado"] = "ok";
        try {
          const data = JSON.parse(xhr.responseText) as {
            subidas?: unknown[];
            errores?: { nombre: string; error: string }[];
          };
          const error = data.errores?.[0]?.error;
          if (xhr.status === 401) {
            estado = "error";
            detalle = "La sesión expiró: vuelve a entrar.";
            onDesconexion();
          } else if (!data.subidas?.length || error) {
            estado = "error";
            detalle = error ?? "no se pudo subir";
          }
        } catch {
          estado = "error";
          detalle = "respuesta del servidor ilegible";
        }
        setSubidas((s) =>
          s.map((u, j) =>
            j === s.length - lista.length + i ? { ...u, progreso: 100, estado, detalle } : u,
          ),
        );
        onRefrescar();
        setTimeout(() => setSubidas((s) => s.slice(1)), 4000);
      });
      xhr.addEventListener("error", () => {
        setSubidas((s) =>
          s.map((u, j) =>
            j === s.length - lista.length + i
              ? { ...u, estado: "error", detalle: "fallo de red" }
              : u,
          ),
        );
      });
      xhr.send(forma);
    });
  };

  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  // Carpetas en una fila desplazable; "Ver todas" las expande en varias líneas.
  const [chipsTodas, setChipsTodas] = useState(false);

  const nombreAlbum = (id?: string) =>
    id ? (albumes.find((a) => a.id === id)?.nombre ?? null) : null;

  const filtro = normalizar(busqueda).trim();
  const encontradas = useMemo(() => {
    let lista = canciones;
    if (albumFiltro === "sueltas") lista = lista.filter((c) => !c.albumId);
    else if (albumFiltro !== "todos") lista = lista.filter((c) => c.albumId === albumFiltro);
    if (artistaFiltro) {
      lista = lista.filter((c) => normalizar(c.artista) === normalizar(artistaFiltro));
    }
    if (filtro) {
      lista = lista.filter((c) =>
        normalizar(
          `${c.titulo} ${c.artista} ${c.album ?? ""} ${nombreAlbum(c.albumId) ?? ""}`,
        ).includes(filtro),
      );
    }
    return lista;
  }, [canciones, albumFiltro, filtro, albumes, artistaFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(encontradas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const desde = (paginaSegura - 1) * POR_PAGINA;
  const visibles = encontradas.slice(desde, desde + POR_PAGINA);

  const cambiarFiltro = (nuevo: FiltroAlbum) => {
    setAlbumFiltro(nuevo);
    setPagina(1);
  };

  const [sonandoId, setSonandoId] = useState<string | null>(null);
  const audioPrevio = useRef<HTMLAudioElement | null>(null);

  const detenerPreview = () => {
    audioPrevio.current?.pause();
    audioPrevio.current = null;
    setSonandoId(null);
  };

  const alternarPreview = (cancion: Cancion) => {
    if (sonandoId === cancion.id) {
      detenerPreview();
      return;
    }
    detenerPreview();
    const el = new Audio(`/api/biblioteca/audio/${cancion.archivo}`);
    el.addEventListener("ended", detenerPreview, { once: true });
    audioPrevio.current = el;
    setSonandoId(cancion.id);
    void el.play().catch(() => detenerPreview());
  };

  const [editando, setEditando] = useState<string | null>(null);
  const [tituloEdit, setTituloEdit] = useState("");
  const [artistaEdit, setArtistaEdit] = useState("");
  const [albumEdit, setAlbumEdit] = useState("");

  const [letraId, setLetraId] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);

  const [portadaId, setPortadaId] = useState<string | null>(null);

  const buscarPortada = async (id: string) => {
    setPortadaId(id);
    const res = await pedirGestor("/api/biblioteca", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reintentarPortada: true }),
    });
    setPortadaId(null);
    if (!res) {
      onDesconexion();
      return;
    }
    onRefrescar();
  };

  const abrirEdicion = (cancion: Cancion) => {
    setEditando(cancion.id);
    setTituloEdit(cancion.titulo);
    setArtistaEdit(cancion.artista);
    setAlbumEdit(cancion.albumId ?? "");
  };

  const guardarEdicion = async (id: string) => {
    const album = albumes.find((a) => a.id === albumEdit);
    const res = await pedirGestor("/api/biblioteca", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        titulo: tituloEdit,
        artista: artistaEdit,
        albumId: album ? album.id : null,
        album: album ? album.nombre : "",
      }),
    });
    setEditando(null);
    if (!res) {
      onDesconexion();
      return;
    }
    onRefrescar();
  };

  const alternarActiva = async (cancion: Cancion) => {
    const res = await pedirGestor("/api/biblioteca", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cancion.id, activa: !cancion.activa }),
    });
    if (!res) {
      onDesconexion();
      return;
    }
    onRefrescar();
  };

  const borrar = async (id: string) => {
    if (sonandoId === id) detenerPreview();
    const res = await pedirGestor(`/api/biblioteca?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setConfirmarBorrado(null);
    if (!res) {
      onDesconexion();
      return;
    }
    onRefrescar();
  };

  return (
    <div className="panel-biblioteca">
      <section
        className={`panel-soltar${arrastrando ? " panel-soltar-activo" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (e.dataTransfer?.files?.length) subirArchivos(e.dataTransfer.files);
        }}
        aria-label="Subir canciones"
      >
        <UploadCloud className="panel-soltar-icono" aria-hidden="true" />
        <div>
          <p className="panel-soltar-texto">Arrastra tus canciones aquí</p>
          <p className="panel-soltar-detalle">
            MP3 · M4A · FLAC · OGG · WAV — hasta 60 MB por archivo
          </p>
        </div>
        <button
          className="panel-boton panel-boton-primario"
          type="button"
          onClick={() => entradaArchivo.current?.click()}
        >
          <Plus aria-hidden="true" />
          Elegir archivos
        </button>
        <input
          ref={entradaArchivo}
          type="file"
          accept={ACEPTADOS}
          multiple
          className="panel-entrada-oculta"
          onChange={(e) => {
            if (e.target.files?.length) subirArchivos(e.target.files);
            e.target.value = "";
          }}
        />
      </section>

      {subidas.length ? (
        <ul className="panel-subidas" aria-live="polite">
          {subidas.map((u, i) => (
            <li key={`${u.nombre}-${i}`} className={`panel-subida panel-subida-${u.estado}`}>
              <span className="panel-subida-nombre">{u.nombre}</span>
              {u.estado === "subiendo" ? (
                <span className="panel-subida-barra">
                  <span style={{ width: `${u.progreso}%` }} />
                </span>
              ) : u.estado === "ok" ? (
                <span className="panel-subida-estado">
                  <Check aria-hidden="true" /> En la biblioteca
                </span>
              ) : (
                <span className="panel-subida-estado">{u.detalle ?? "error"}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="panel-herramientas">
        <div className="panel-buscador">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por título, artista o álbum…"
            aria-label="Buscar canciones"
          />
          {busqueda ? (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              aria-label="Limpiar la búsqueda"
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {artistaFiltro ? (
        <div className="panel-filtro-artista">
          Artista: <strong>{artistaFiltro}</strong>
          <button
            type="button"
            onClick={() => setArtistaFiltro(null)}
            aria-label="Quitar el filtro de artista"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {albumes.length ? (
        <div
          className={`panel-chips${chipsTodas ? " panel-chips-todas" : ""}`}
          role="group"
          aria-label="Filtrar por álbum"
        >
          <button
            type="button"
            className={`panel-chip${albumFiltro === "todos" ? " panel-chip-activa" : ""}`}
            onClick={() => cambiarFiltro("todos")}
          >
            Todos
          </button>
          {albumes.map((album) => (
            <button
              key={album.id}
              type="button"
              className={`panel-chip${albumFiltro === album.id ? " panel-chip-activa" : ""}`}
              onClick={() => cambiarFiltro(album.id)}
            >
              {album.nombre}
              <span className="panel-chip-numero">{album.canciones}</span>
            </button>
          ))}
          <button
            type="button"
            className={`panel-chip${albumFiltro === "sueltas" ? " panel-chip-activa" : ""}`}
            onClick={() => cambiarFiltro("sueltas")}
          >
            Sin álbum
          </button>
          {albumes.length > 6 ? (
            <button
              type="button"
              className="panel-chip panel-chip-expande"
              onClick={() => setChipsTodas((v) => !v)}
              aria-expanded={chipsTodas}
              title={
                chipsTodas
                  ? "Poner las carpetas en una sola fila"
                  : "Mostrar todas las carpetas"
              }
            >
              {chipsTodas ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronsRight aria-hidden="true" />
              )}
              {chipsTodas ? "Menos" : `Ver todas (${albumes.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

      {!canciones.length ? (
        <p className="panel-vacio">
          <Music2 aria-hidden="true" />
          Todavía no hay canciones. Sube la primera arriba y en unos segundos
          estará rotando en la radio.
        </p>
      ) : null}
      {canciones.length && !encontradas.length ? (
        <p className="panel-vacio">
          <Search aria-hidden="true" />
          Nada con “{busqueda.trim() || "ese filtro"}”. Prueba con otra palabra.
        </p>
      ) : null}

      {visibles.map((cancion) => {
        const album = nombreAlbum(cancion.albumId);
        return (
          <article
            key={cancion.id}
            className={`panel-cancion${cancion.activa ? "" : " panel-cancion-pausada"}`}
          >
            <img
              className="panel-cancion-portada"
              src={cancion.portada ?? PORTADA_GESTOR}
              alt={`Portada de ${cancion.titulo}`}
              width={48}
              height={48}
            />

            <div className="panel-cancion-datos">
              {editando === cancion.id ? (
                <div className="panel-edicion">
                  <div className="panel-campo">
                    <label htmlFor={`editar-titulo-${cancion.id}`}>Título</label>
                    <input
                      id={`editar-titulo-${cancion.id}`}
                      value={tituloEdit}
                      onChange={(e) => setTituloEdit(e.target.value)}
                      placeholder="El nombre de la canción"
                    />
                  </div>
                  <div className="panel-campo">
                    <label htmlFor={`editar-artista-${cancion.id}`}>Artista</label>
                    <input
                      id={`editar-artista-${cancion.id}`}
                      value={artistaEdit}
                      onChange={(e) => setArtistaEdit(e.target.value)}
                      placeholder="Quién la toca"
                    />
                  </div>
                  <div className="panel-campo">
                    <label htmlFor={`editar-album-${cancion.id}`}>
                      Álbum <span className="panel-campo-nota">(la carpeta de la casa)</span>
                    </label>
                    <select
                      id={`editar-album-${cancion.id}`}
                      value={albumEdit}
                      onChange={(e) => setAlbumEdit(e.target.value)}
                    >
                      <option value="">— Sin álbum —</option>
                      {albumes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                    {!albumEdit && cancion.album ? (
                      <p className="panel-campo-ayuda">
                        La etiqueta del archivo dice “{cancion.album}”; al guardar
                        sin álbum se limpia y la radio ya no muestra la línea.
                      </p>
                    ) : null}
                  </div>
                  <div className="panel-edicion-acciones">
                    <button
                      className="panel-boton panel-boton-primario"
                      type="button"
                      onClick={() => void guardarEdicion(cancion.id)}
                    >
                      <Check aria-hidden="true" /> Guardar
                    </button>
                    <button
                      className="panel-boton"
                      type="button"
                      onClick={() => setEditando(null)}
                    >
                      <X aria-hidden="true" /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="panel-cancion-linea">
                    <h3 className="panel-cancion-titulo">{cancion.titulo}</h3>
                    <span
                      className={`panel-pill ${cancion.activa ? "panel-pill-verde" : "panel-pill-gris"}`}
                    >
                      {cancion.activa ? "Al aire" : "En pausa"}
                    </span>
                  </div>
                  <p className="panel-cancion-meta">
                    {cancion.artista}
                    {album ? ` · ${album}` : cancion.album ? ` · ${cancion.album}` : ""}
                  </p>
                  <p className="panel-cancion-sub">
                    {formatoDuracion(cancion.duracionSeg)} ·{" "}
                    {formatoTamano(cancion.tamanoBytes)}
                    <span
                      className={`panel-marca${cancion.conLetra ? " panel-marca-si" : ""}`}
                    >
                      {cancion.instrumental
                        ? "Instrumental"
                        : cancion.conLetra
                          ? "Con letra"
                          : "Sin letra"}
                    </span>
                    {!cancion.portada ? (
                      <span className="panel-marca panel-marca-falta">Sin portada</span>
                    ) : null}
                  </p>
                </>
              )}
            </div>

            <div className="panel-cancion-acciones">
              <button
                className="panel-icono"
                type="button"
                onClick={() => alternarPreview(cancion)}
                aria-label={
                  sonandoId === cancion.id
                    ? `Detener la previsualización de ${cancion.titulo}`
                    : `Previsualizar ${cancion.titulo}`
                }
              >
                {sonandoId === cancion.id ? (
                  <Pause aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
              </button>
              <button
                className="panel-icono"
                type="button"
                onClick={() =>
                  editando === cancion.id ? setEditando(null) : abrirEdicion(cancion)
                }
                aria-label={`Editar ${cancion.titulo}`}
              >
                <Pencil aria-hidden="true" />
              </button>
              <button
                className={`panel-icono${cancion.conLetra ? " panel-icono-letra" : ""}`}
                type="button"
                onClick={() => setLetraId(letraId === cancion.id ? null : cancion.id)}
                aria-expanded={letraId === cancion.id}
                aria-label={`Letra de ${cancion.titulo}`}
                title={
                  cancion.conLetra
                    ? "Ver o corregir la letra"
                    : "Pegar la letra a mano (LRCLIB no la tiene)"
                }
              >
                <FileText aria-hidden="true" />
              </button>
              <button
                className="panel-icono panel-icono-portada"
                type="button"
                onClick={() => void buscarPortada(cancion.id)}
                disabled={portadaId === cancion.id}
                aria-label={`Buscar la portada de ${cancion.titulo}`}
                title="Volver a buscar la portada en Spotify"
              >
                {portadaId === cancion.id ? (
                  <Loader2 className="panel-icono-gira" aria-hidden="true" />
                ) : (
                  <Image aria-hidden="true" />
                )}
              </button>
              <button
                className={`panel-icono${cancion.activa ? " panel-icono-activo" : ""}`}
                type="button"
                onClick={() => void alternarActiva(cancion)}
                aria-pressed={cancion.activa}
                aria-label={
                  cancion.activa
                    ? `Pausar ${cancion.titulo} en la rotación`
                    : `Activar ${cancion.titulo} en la rotación`
                }
                title={cancion.activa ? "Pausar en la rotación" : "Activar en la rotación"}
              >
                <Check aria-hidden="true" />
              </button>
              {confirmarBorrado === cancion.id ? (
                <span className="panel-confirmar">
                  ¿Borrar?
                  <button
                    className="panel-boton panel-boton-peligro"
                    type="button"
                    onClick={() => void borrar(cancion.id)}
                  >
                    Sí
                  </button>
                  <button
                    className="panel-boton"
                    type="button"
                    onClick={() => setConfirmarBorrado(null)}
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  className="panel-icono panel-icono-peligro"
                  type="button"
                  onClick={() => setConfirmarBorrado(cancion.id)}
                  aria-label={`Borrar ${cancion.titulo}`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              )}
            </div>

            {letraId === cancion.id ? (
              <EditorLetra
                cancion={cancion}
                onCerrar={() => setLetraId(null)}
                onGuardada={() => {
                  setLetraId(null);
                  onRefrescar();
                }}
                onDesconexion={onDesconexion}
              />
            ) : null}
          </article>
        );
      })}

      {encontradas.length > POR_PAGINA ? (
        <nav className="panel-paginacion" aria-label="Páginas de la biblioteca">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={paginaSegura <= 1}
            aria-label="Página anterior"
          >
            Anterior
          </button>
          {paginasVisibles(paginaSegura, totalPaginas).map((n, i) =>
            n === "…" ? (
              <span key={`sep-${i}`} className="panel-paginacion-sep" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={n === paginaSegura ? "panel-pagina-actual" : undefined}
                aria-current={n === paginaSegura ? "page" : undefined}
                onClick={() => setPagina(n)}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={paginaSegura >= totalPaginas}
            aria-label="Página siguiente"
          >
            Siguiente
          </button>
        </nav>
      ) : null}

      {filtro && encontradas.length ? (
        <p className="panel-lista-resumen">
          {encontradas.length} resultado{encontradas.length === 1 ? "" : "s"}
          {encontradas.length > POR_PAGINA
            ? ` · página ${paginaSegura} de ${totalPaginas}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
