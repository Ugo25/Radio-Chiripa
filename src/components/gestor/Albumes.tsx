"use client";

import { useRef, useState } from "react";
import {
  Check,
  Disc3,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Mic2,
  Music2,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { pedirGestor } from "./api";
import {
  formatoDuracion,
  formatoDuracionLarga,
  iniciales,
  NOMBRE_TIPO,
  type AlbumPanel,
  type ArtistaPanel,
  type Cancion,
  type TipoAlbum,
} from "./tipos";

const TIPOS: TipoAlbum[] = ["album", "single", "ep"];
const ACEPTADOS = ".mp3,.m4a,.mp4,.flac,.ogg,.opus,.wav,audio/*";

export function Albumes({
  albumes,
  artistas,
  canciones,
  sueltas,
  onRefrescar,
  onVerCanciones,
  onVerArtista,
  onDesconexion,
}: {
  albumes: AlbumPanel[];
  artistas: ArtistaPanel[];
  canciones: Cancion[];
  sueltas: number;
  onRefrescar: () => void;
  onVerCanciones: (albumId: string | null) => void;
  onVerArtista: (artista: string) => void;
  onDesconexion: () => void;
}) {
  const [vista, setVista] = useState<"album" | "artista">("album");

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoAlbum>("album");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");

  const crear = async (nombreFinal: string, tipoFinal: TipoAlbum) => {
    if (!nombreFinal.trim() || creando) return;
    setCreando(true);
    setError("");
    const res = await pedirGestor("/api/biblioteca/albumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombreFinal, tipo: tipoFinal }),
    });
    setCreando(false);
    if (!res) {
      onDesconexion();
      return null;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "No se pudo crear el álbum.");
      return null;
    }
    const data = (await res.json()) as { album: AlbumPanel };
    onRefrescar();
    return data.album;
  };

  const [renombres, setRenombres] = useState<Record<string, string>>({});
  const [tiposEdit, setTiposEdit] = useState<Record<string, TipoAlbum>>({});
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);
  const [gestion, setGestion] = useState<string | null>(null);
  const [subiendoAlbum, setSubiendoAlbum] = useState<string | null>(null);
  const entradaArchivos = useRef<HTMLInputElement>(null);
  const entradaCaratula = useRef<HTMLInputElement>(null);
  const [caratulaAlbum, setCaratulaAlbum] = useState<string | null>(null);

  const renombrar = async (id: string) => {
    const nuevo = renombres[id]?.trim();
    if (!nuevo) return;
    const res = await pedirGestor("/api/biblioteca/albumes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        nombre: nuevo,
        ...(tiposEdit[id] ? { tipo: tiposEdit[id] } : {}),
      }),
    });
    if (!res) {
      onDesconexion();
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "No se pudo renombrar el álbum.");
      return;
    }
    setRenombres((r) => {
      const copia = { ...r };
      delete copia[id];
      return copia;
    });
    setTiposEdit((t) => {
      const copia = { ...t };
      delete copia[id];
      return copia;
    });
    onRefrescar();
  };

  const borrar = async (id: string) => {
    const res = await pedirGestor(
      `/api/biblioteca/albumes?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    setConfirmarBorrado(null);
    if (!res) {
      onDesconexion();
      return;
    }
    onRefrescar();
  };

  const subirCaratula = async (albumId: string, archivo: File) => {
    setSubiendoAlbum(albumId);
    setError("");
    const forma = new FormData();
    forma.append("id", albumId);
    forma.append("imagen", archivo);
    const res = await pedirGestor("/api/biblioteca/albumes/portada", {
      method: "POST",
      body: forma,
    });
    setSubiendoAlbum(null);
    if (!res) {
      onDesconexion();
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "No se pudo guardar la carátula.");
      return;
    }
    onRefrescar();
  };

  const subirCanciones = async (albumId: string, archivos: FileList | File[]) => {
    setSubiendoAlbum(albumId);
    setError("");
    let fallas = 0;
    for (const archivo of Array.from(archivos)) {
      const forma = new FormData();
      forma.append("archivos", archivo);
      forma.append("albumId", albumId);
      const res = await pedirGestor("/api/biblioteca", { method: "POST", body: forma });
      if (!res) {
        onDesconexion();
        setSubiendoAlbum(null);
        return;
      }
      if (!res.ok) fallas++;
    }
    setSubiendoAlbum(null);
    if (fallas) setError(`${fallas} archivo(s) no se pudieron subir (¿duplicados?).`);
    onRefrescar();
  };

  const moverCancion = async (cancion: Cancion, albumId: string | null) => {
    const res = await pedirGestor("/api/biblioteca", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cancion.id, albumId }),
    });
    if (!res) {
      onDesconexion();
      return;
    }
    onRefrescar();
  };

  const [albumDeArtista, setAlbumDeArtista] = useState<string | null>(null);
  const [nombreArtistaNuevo, setNombreArtistaNuevo] = useState("");

  const crearAlbumDeArtista = async (artista: ArtistaPanel) => {
    const nombreFinal = (nombreArtistaNuevo || artista.nombre).trim();
    const album = await crear(nombreFinal, "album");
    if (!album) return;
    const sueltasDelArtista = canciones.filter(
      (c) => c.artista === artista.nombre && !c.albumId,
    );
    for (const cancion of sueltasDelArtista) {
      await moverCancion(cancion, album.id);
    }
    setAlbumDeArtista(null);
    setNombreArtistaNuevo("");
  };

  return (
    <div className="panel-albumes">
      <section className="panel-tarjeta panel-album-crear">
        <div className="panel-album-crear-fila">
          <div>
            <h2 className="panel-tarjeta-titulo">
              {vista === "album" ? "Nueva carpeta" : "Nueva carpeta por artista"}
            </h2>
            <p className="panel-tarjeta-sub">
              {vista === "album"
                ? "Agrupa canciones con su nombre, carátula y tipo: Álbum, Sencillo o EP. Desde cada carpeta agregas canciones sin salir de aquí."
                : "Elige un artista abajo y crea su carpeta con todas sus canciones sueltas de un golpe."}
            </p>
          </div>
          <div className="panel-tabs-vista" role="group" aria-label="Agrupar por">
            <button
              type="button"
              className={vista === "album" ? "panel-tab-vista-activa" : undefined}
              onClick={() => setVista("album")}
              aria-pressed={vista === "album"}
            >
              <Disc3 aria-hidden="true" /> Por álbum
            </button>
            <button
              type="button"
              className={vista === "artista" ? "panel-tab-vista-activa" : undefined}
              onClick={() => setVista("artista")}
              aria-pressed={vista === "artista"}
            >
              <Mic2 aria-hidden="true" /> Por artista
            </button>
          </div>
        </div>

        {vista === "album" ? (
          <form
            className="panel-album-forma"
            onSubmit={(e) => {
              e.preventDefault();
              void crear(nombre, tipo);
            }}
          >
            <input
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (error) setError("");
              }}
              placeholder="El nombre del álbum…"
              aria-label="Nombre del nuevo álbum"
            />
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoAlbum)}
              aria-label="Tipo de la carpeta"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO[t]}
                </option>
              ))}
            </select>
            <button
              className="panel-boton panel-boton-primario"
              type="submit"
              disabled={!nombre.trim() || creando}
            >
              {creando ? (
                <Loader2 className="panel-girando" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              Crear
            </button>
          </form>
        ) : null}

        {error ? (
          <p className="panel-aviso-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {vista === "album" ? (
        albumes.length || sueltas ? (
          <div className="panel-albumes-grid">
            {albumes.map((album) => {
              const renombrando = renombres[album.id] !== undefined;
              const gestionando = gestion === album.id;
              const delAlbum = canciones.filter((c) => c.albumId === album.id);
              const sueltasDisponibles = canciones.filter((c) => !c.albumId);
              return (
                <article key={album.id} className="panel-album">
                  <button
                    type="button"
                    className="panel-album-cuerpo"
                    onClick={() => onVerCanciones(album.id)}
                    title={`Ver las ${album.canciones} canciones de ${album.nombre}`}
                  >
                    <span className="panel-album-portada" aria-hidden="true">
                      {album.portada ? (
                        <img src={album.portada} alt="" width={72} height={72} />
                      ) : (
                        <span className="panel-album-iniciales">
                          {iniciales(album.nombre)}
                        </span>
                      )}
                      <span
                        className={`panel-album-tipo${album.tipo === "album" ? " panel-album-tipo-gris" : ""}`}
                      >
                        {NOMBRE_TIPO[album.tipo]}
                      </span>
                    </span>
                    <span className="panel-album-datos">
                      <h3 className="panel-album-nombre">{album.nombre}</h3>
                      <p className="panel-album-meta">
                        {album.canciones} {album.canciones === 1 ? "canción" : "canciones"} ·{" "}
                        {formatoDuracionLarga(album.duracionSeg)}
                      </p>
                      <p className="panel-album-sub">{album.activas} en rotación</p>
                    </span>
                  </button>

                  <div className="panel-album-acciones">
                    {renombrando ? (
                      <>
                        <input
                          className="panel-album-renombra"
                          value={renombres[album.id]}
                          onChange={(e) =>
                            setRenombres((r) => ({ ...r, [album.id]: e.target.value }))
                          }
                          aria-label={`Nombre nuevo para ${album.nombre}`}
                          autoFocus
                        />
                        <select
                          className="panel-album-renombra"
                          value={tiposEdit[album.id] ?? album.tipo}
                          onChange={(e) =>
                            setTiposEdit((t) => ({
                              ...t,
                              [album.id]: e.target.value as TipoAlbum,
                            }))
                          }
                          aria-label="Tipo nuevo"
                        >
                          {TIPOS.map((t) => (
                            <option key={t} value={t}>
                              {NOMBRE_TIPO[t]}
                            </option>
                          ))}
                        </select>
                        <button
                          className="panel-icono"
                          type="button"
                          onClick={() => void renombrar(album.id)}
                          aria-label="Confirmar el nombre nuevo"
                        >
                          <Check aria-hidden="true" />
                        </button>
                        <button
                          className="panel-icono"
                          type="button"
                          onClick={() =>
                            setRenombres((r) => {
                              const copia = { ...r };
                              delete copia[album.id];
                              return copia;
                            })
                          }
                          aria-label="Cancelar el renombrado"
                        >
                          <X aria-hidden="true" />
                        </button>
                      </>
                    ) : confirmarBorrado === album.id ? (
                      <span className="panel-confirmar">
                        ¿Borrar el álbum?
                        <button
                          className="panel-boton panel-boton-peligro"
                          type="button"
                          onClick={() => void borrar(album.id)}
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
                      <>
                        <button
                          className="panel-icono"
                          type="button"
                          onClick={() => onVerCanciones(album.id)}
                          aria-label={`Ver las canciones de ${album.nombre}`}
                          title="Ver sus canciones"
                        >
                          <FolderOpen aria-hidden="true" />
                        </button>
                        <button
                          className={`panel-icono${gestionando ? " panel-icono-activo" : ""}`}
                          type="button"
                          onClick={() => setGestion(gestionando ? null : album.id)}
                          aria-label={`Agregar o quitar canciones de ${album.nombre}`}
                          title="Agregar o quitar canciones"
                        >
                          <Plus aria-hidden="true" />
                        </button>
                        <input
                          ref={caratulaAlbum === album.id ? entradaCaratula : null}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="panel-entrada-oculta"
                          onChange={(e) => {
                            if (e.target.files?.[0] && caratulaAlbum === album.id) {
                              void subirCaratula(album.id, e.target.files[0]);
                            }
                            setCaratulaAlbum(null);
                            e.target.value = "";
                          }}
                        />
                        <button
                          className="panel-icono panel-icono-portada"
                          type="button"
                          onClick={() => {
                            setCaratulaAlbum(album.id);
                            requestAnimationFrame(() =>
                              entradaCaratula.current?.click(),
                            );
                          }}
                          disabled={subiendoAlbum === album.id}
                          aria-label={`Cambiar la carátula de ${album.nombre}`}
                          title={
                            album.portadaPropia
                              ? "Cambiar la carátula propia"
                              : "Subir una carátula propia"
                          }
                        >
                          {subiendoAlbum === album.id ? (
                            <Loader2 className="panel-girando" aria-hidden="true" />
                          ) : (
                            <ImageIcon aria-hidden="true" />
                          )}
                        </button>
                        <button
                          className="panel-icono"
                          type="button"
                          onClick={() =>
                            setRenombres((r) => ({ ...r, [album.id]: album.nombre }))
                          }
                          aria-label={`Renombrar ${album.nombre}`}
                          title="Renombrar o cambiar el tipo"
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          className="panel-icono panel-icono-peligro"
                          type="button"
                          onClick={() => setConfirmarBorrado(album.id)}
                          aria-label={`Borrar el álbum ${album.nombre}`}
                          title="Borrar el álbum (las canciones se quedan)"
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>

                  {gestionando ? (
                    <div className="panel-album-gestion">
                      <input
                        ref={gestion === album.id ? entradaArchivos : null}
                        type="file"
                        accept={ACEPTADOS}
                        multiple
                        className="panel-entrada-oculta"
                        onChange={(e) => {
                          if (e.target.files?.length) {
                            void subirCanciones(album.id, e.target.files);
                          }
                          e.target.value = "";
                        }}
                      />
                      <button
                        className="panel-boton panel-boton-primario"
                        type="button"
                        onClick={() => entradaArchivos.current?.click()}
                        disabled={subiendoAlbum === album.id}
                      >
                        {subiendoAlbum === album.id ? (
                          <Loader2 className="panel-girando" aria-hidden="true" />
                        ) : (
                          <UploadCloud aria-hidden="true" />
                        )}
                        Subir canciones a este álbum
                      </button>

                      {delAlbum.length ? (
                        <ul className="panel-album-lista">
                          {delAlbum.map((cancion) => (
                            <li key={cancion.id}>
                              <span className="panel-album-lista-titulo">
                                {cancion.titulo}
                              </span>
                              <button
                                className="panel-icono panel-icono-peligro"
                                type="button"
                                onClick={() => void moverCancion(cancion, null)}
                                aria-label={`Sacar ${cancion.titulo} del álbum`}
                                title="Sacar del álbum (la canción se queda)"
                              >
                                <X aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="panel-album-gestion-vacio">
                          Este álbum todavía no tiene canciones: sube archivos o
                          engancha las sueltas de abajo.
                        </p>
                      )}

                      {sueltasDisponibles.length ? (
                        <>
                          <p className="panel-album-gestion-titulo">
                            Canciones sueltas de la biblioteca
                          </p>
                          <ul className="panel-album-lista">
                            {sueltasDisponibles.map((cancion) => (
                              <li key={cancion.id}>
                                <span className="panel-album-lista-titulo">
                                  {cancion.titulo}
                                  <small> · {cancion.artista}</small>
                                </span>
                                <button
                                  className="panel-icono panel-icono-activo"
                                  type="button"
                                  onClick={() => void moverCancion(cancion, album.id)}
                                  aria-label={`Agregar ${cancion.titulo} al álbum`}
                                  title="Agregar a este álbum"
                                >
                                  <Plus aria-hidden="true" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {sueltas ? (
              <article className="panel-album panel-album-sueltas">
                <button
                  type="button"
                  className="panel-album-cuerpo"
                  onClick={() => onVerCanciones(null)}
                  title="Ver las canciones sin álbum"
                >
                  <span className="panel-album-portada" aria-hidden="true">
                    <span className="panel-album-iniciales">
                      <Music2 aria-hidden="true" />
                    </span>
                  </span>
                  <span className="panel-album-datos">
                    <h3 className="panel-album-nombre">Sin álbum</h3>
                    <p className="panel-album-meta">
                      {sueltas} {sueltas === 1 ? "canción suelta" : "canciones sueltas"}
                    </p>
                    <p className="panel-album-sub">Sin carpeta de la casa</p>
                  </span>
                </button>
              </article>
            ) : null}
          </div>
        ) : (
          <p className="panel-vacio">
            <Music2 aria-hidden="true" />
            Todavía no hay álbumes: crea el primero arriba y agrégale canciones
            con el botón +.
          </p>
        )
      ) : (
        <div className="panel-albumes-grid">
          {artistas.map((artista) => (
            <article key={artista.nombre} className="panel-album">
              <button
                type="button"
                className="panel-album-cuerpo"
                onClick={() => onVerArtista(artista.nombre)}
                title={`Ver las ${artista.canciones} canciones de ${artista.nombre}`}
              >
                <span className="panel-album-portada" aria-hidden="true">
                  {artista.portada ? (
                    <img src={artista.portada} alt="" width={72} height={72} />
                  ) : (
                    <span className="panel-album-iniciales">
                      {iniciales(artista.nombre)}
                    </span>
                  )}
                </span>
                <span className="panel-album-datos">
                  <h3 className="panel-album-nombre">{artista.nombre}</h3>
                  <p className="panel-album-meta">
                    {artista.canciones} {artista.canciones === 1 ? "canción" : "canciones"} ·{" "}
                    {formatoDuracionLarga(artista.duracionSeg)}
                  </p>
                  <p className="panel-album-sub">
                    {artista.albumes} en álbumes · {artista.sueltas} suelta
                    {artista.sueltas === 1 ? "" : "s"}
                  </p>
                </span>
              </button>

              <div className="panel-album-acciones">
                {albumDeArtista === artista.nombre ? (
                  <>
                    <input
                      className="panel-album-renombra"
                      value={nombreArtistaNuevo || artista.nombre}
                      onChange={(e) => setNombreArtistaNuevo(e.target.value)}
                      aria-label={`Nombre del álbum nuevo de ${artista.nombre}`}
                      autoFocus
                    />
                    <button
                      className="panel-icono"
                      type="button"
                      onClick={() => void crearAlbumDeArtista(artista)}
                      aria-label="Crear el álbum"
                    >
                      <Check aria-hidden="true" />
                    </button>
                    <button
                      className="panel-icono"
                      type="button"
                      onClick={() => {
                        setAlbumDeArtista(null);
                        setNombreArtistaNuevo("");
                      }}
                      aria-label="Cancelar"
                    >
                      <X aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="panel-icono"
                      type="button"
                      onClick={() => onVerArtista(artista.nombre)}
                      aria-label={`Ver las canciones de ${artista.nombre}`}
                      title="Ver sus canciones"
                    >
                      <FolderOpen aria-hidden="true" />
                    </button>
                    <button
                      className="panel-icono panel-icono-portada"
                      type="button"
                      onClick={() => setAlbumDeArtista(artista.nombre)}
                      disabled={!artista.sueltas}
                      aria-label={`Crear un álbum con las canciones sueltas de ${artista.nombre}`}
                      title={
                        artista.sueltas
                          ? `Álbum nuevo con sus ${artista.sueltas} canciones sueltas`
                          : "Sin canciones sueltas: todo su repertorio ya está en álbumes"
                      }
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          {!artistas.length ? (
            <p className="panel-vacio">
              <Music2 aria-hidden="true" />
              Todavía no hay canciones: sube la primera en la Biblioteca y los
              artistas aparecerán solos.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
