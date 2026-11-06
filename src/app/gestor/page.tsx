"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Album as AlbumIcon,
  FileText,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  Users,
} from "lucide-react";
import { PuertaEspera } from "@/components/chiripa/PuertaBiblioteca";
import type { FiltroAlbum } from "@/components/gestor/Biblioteca";
import { Resumen } from "@/components/gestor/Resumen";
import { cabeceraLlave, borrarToken } from "@/lib/llave-cliente";
import { iniciales, type AlAire, type AlbumPanel, type ArtistaPanel, type Cancion, type CuentaPanel, type EstadoSenal, type HistorialOyentes, type MetaBiblioteca, type Quien, type Seccion } from "@/components/gestor/tipos";

const Biblioteca = dynamic(() =>
  import("@/components/gestor/Biblioteca").then((m) => m.Biblioteca),
);
const Albumes = dynamic(() =>
  import("@/components/gestor/Albumes").then((m) => m.Albumes),
);
const Letras = dynamic(() =>
  import("@/components/gestor/Letras").then((m) => m.Letras),
);
const Cuentas = dynamic(() =>
  import("@/components/gestor/Cuentas").then((m) => m.Cuentas),
);
const Configuracion = dynamic(() =>
  import("@/components/gestor/Configuracion").then((m) => m.Configuracion),
);

type AlbumesResp = { albumes: AlbumPanel[]; artistas: ArtistaPanel[]; sueltas: number };

const TITULOS: Record<Seccion, { titulo: string; descripcion: string }> = {
  resumen: {
    titulo: "Resumen",
    descripcion: "La radio de un vistazo: señal, métricas y actividad.",
  },
  biblioteca: {
    titulo: "Biblioteca",
    descripcion: "Las canciones de la casa: subir, editar y la rotación.",
  },
  albumes: {
    titulo: "Álbumes",
    descripcion: "Las carpetas que agrupan las canciones; su nombre suena en la radio.",
  },
  letras: {
    titulo: "Letras",
    descripcion: "Automáticas de LRCLIB o pegadas a mano, una por una.",
  },
  cuentas: {
    titulo: "Cuentas",
    descripcion: "Quién tiene llave del panel y con qué poderes.",
  },
  configuracion: {
    titulo: "Configuración",
    descripcion: "El acceso, la apariencia del panel y tus datos.",
  },
};

export default function PaginaGestor() {
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [quien, setQuien] = useState<Quien | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("resumen");

  const [canciones, setCanciones] = useState<Cancion[]>([]);
  const [albumes, setAlbumes] = useState<AlbumPanel[]>([]);
  const [artistas, setArtistas] = useState<ArtistaPanel[]>([]);
  const [sueltas, setSueltas] = useState(0);
  const [meta, setMeta] = useState<MetaBiblioteca | null>(null);
  const [cuentas, setCuentas] = useState<CuentaPanel[]>([]);
  const [alAire, setAlAire] = useState<AlAire | null>(null);
  const [oyentes, setOyentes] = useState<number | null>(null);
  const [historial, setHistorial] = useState<HistorialOyentes | null>(null);
  const [senalEstado, setSenalEstado] = useState<EstadoSenal | null>(null);

  const [albumFiltro, setAlbumFiltro] = useState<FiltroAlbum>("todos");
  const [artistaFiltro, setArtistaFiltro] = useState<string | null>(null);

  const [lateralAbierto, setLateralAbierto] = useState(true);
  useEffect(() => {
    try {
      const guardado = localStorage.getItem("chiripa-panel-lateral");
      if (guardado === "cerrado") setLateralAbierto(false);
    } catch {
      /* sin memoria: abierto, como siempre */
    }
    const alCambiar = (e: Event) => {
      setLateralAbierto((e as CustomEvent<string>).detail !== "cerrado");
    };
    window.addEventListener("chiripa-lateral", alCambiar);
    try {
      if (localStorage.getItem("chiripa-panel-denso") === "1") {
        document.documentElement.classList.add("panel-denso");
      }
      // El tema (negro/blanco) se aplica antes de pintar el panel.
      if (localStorage.getItem("chiripa-panel-tema") === "claro") {
        document.documentElement.classList.add("panel-claro");
      }
    } catch {
      /* sin memoria */
    }
    return () => window.removeEventListener("chiripa-lateral", alCambiar);
  }, []);
  const alternarLateral = () => {
    setLateralAbierto((abierto) => {
      try {
        localStorage.setItem("chiripa-panel-lateral", abierto ? "cerrado" : "abierto");
      } catch {
        /* sin memoria: no pasa nada */
      }
      return !abierto;
    });
  };

  const esDueno = quien?.rol === "dueno";

  const cargarBibliotecaYAlbumes = useCallback(async () => {
    const [resBiblio, resAlbumes] = await Promise.all([
      fetch("/api/biblioteca", { cache: "no-store", headers: cabeceraLlave() }),
      fetch("/api/biblioteca/albumes", { cache: "no-store", headers: cabeceraLlave() }),
    ]);
    if (resBiblio.status === 401 || resAlbumes.status === 401) {
      setConectado(false);
      return;
    }
    if (resBiblio.ok) {
      const data = (await resBiblio.json()) as {
        canciones: Cancion[];
        meta: MetaBiblioteca;
      };
      setCanciones(data.canciones ?? []);
      setMeta(data.meta ?? null);
    }
    if (resAlbumes.ok) {
      const data = (await resAlbumes.json()) as AlbumesResp;
      setAlbumes(data.albumes ?? []);
      setArtistas(data.artistas ?? []);
      setSueltas(data.sueltas ?? 0);
    }
  }, []);

  const cargarCuentas = useCallback(async () => {
    const res = await fetch("/api/biblioteca/cuentas", {
      cache: "no-store",
      headers: cabeceraLlave(),
    });
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) return;
    const data = (await res.json()) as { cuentas: CuentaPanel[] };
    setCuentas(data.cuentas ?? []);
  }, []);

  const cargarAire = useCallback(async () => {
    const [resAire, resOyentes, resHistorial, resSenal] = await Promise.all([
      fetch("/api/radio/now-playing", { cache: "no-store" }).catch(() => null),
      fetch("/api/radio/listeners", { cache: "no-store" }).catch(() => null),
      fetch("/api/radio/oyentes/historial", { cache: "no-store" }).catch(() => null),
      fetch("/api/radio/senal", { cache: "no-store" }).catch(() => null),
    ]);
    try {
      setAlAire(resAire && resAire.ok ? ((await resAire.json()) as AlAire) : null);
    } catch {
      setAlAire(null);
    }
    try {
      setOyentes(
        resOyentes && resOyentes.ok
          ? ((await resOyentes.json()) as { espectadores?: number }).espectadores ?? null
          : null,
      );
    } catch {
      setOyentes(null);
    }
    try {
      setHistorial(
        resHistorial && resHistorial.ok
          ? ((await resHistorial.json()) as HistorialOyentes)
          : null,
      );
    } catch {
      setHistorial(null);
    }
    try {
      setSenalEstado(
        resSenal && resSenal.ok ? ((await resSenal.json()) as EstadoSenal) : null,
      );
    } catch {
      setSenalEstado(null);
    }
  }, []);

  const cargarTodo = useCallback(async () => {
    await Promise.all([
      cargarBibliotecaYAlbumes(),
      cargarAire(),
      quien?.rol === "dueno" ? cargarCuentas() : Promise.resolve(),
    ]);
  }, [cargarBibliotecaYAlbumes, cargarAire, cargarCuentas, quien?.rol]);

  useEffect(() => {
    fetch("/api/biblioteca/sesion", { cache: "no-store", headers: cabeceraLlave() })
      .then((r) => r.json())
      .then((d: { conectado?: boolean; quien?: Quien }) => {
        if (d.conectado) {
          setQuien(d.quien ?? null);
          setConectado(true);
        } else {
          setConectado(false);
        }
      })
      .catch(() => setConectado(false));
  }, []);

  // Sin llave —de arranque o al caducar en pleno uso— el panel no se pinta:
  // la puerta vive en /acceso y allá vamos.
  useEffect(() => {
    if (conectado === false) window.location.replace("/acceso");
  }, [conectado]);

  useEffect(() => {
    if (conectado) void cargarTodo();
  }, [conectado, cargarTodo]);

  useEffect(() => {
    if (!conectado) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargarAire();
    }, 30_000);
    return () => clearInterval(t);
  }, [conectado, cargarAire]);

  const irA = (nueva: Seccion, albumId?: string | null) => {
    if (albumId !== undefined) setAlbumFiltro(albumId ?? "sueltas");
    setSeccion(nueva);
  };

  const irAArtista = (artista: string) => {
    setArtistaFiltro(artista);
    setAlbumFiltro("todos");
    setSeccion("biblioteca");
  };

  const seccionVisible: Seccion = seccion === "cuentas" && !esDueno ? "resumen" : seccion;

  const salir = async () => {
    borrarToken();
    await fetch("/api/biblioteca/sesion", { method: "DELETE" }).catch(() => {});
    setConectado(false);
    setQuien(null);
    setCanciones([]);
    setAlbumes([]);
    setArtistas([]);
    setCuentas([]);
    setMeta(null);
  };

  if (conectado === null) {
    return <PuertaEspera texto="Abriendo el panel…" />;
  }

  if (!conectado) {
    return <PuertaEspera texto="Abriendo la puerta…" />;
  }

  const nav: { id: Seccion; etiqueta: string; icono: React.ReactNode; badge?: number }[] = [
    { id: "resumen", etiqueta: "Resumen", icono: <LayoutDashboard aria-hidden="true" /> },
    {
      id: "biblioteca",
      etiqueta: "Biblioteca",
      icono: <LibraryBig aria-hidden="true" />,
      badge: canciones.length,
    },
    { id: "albumes", etiqueta: "Álbumes", icono: <AlbumIcon aria-hidden="true" />, badge: albumes.length },
    {
      id: "letras",
      etiqueta: "Letras",
      icono: <FileText aria-hidden="true" />,
      badge: canciones.filter((c) => !c.conLetra).length || undefined,
    },
    ...(esDueno
      ? [{ id: "cuentas" as Seccion, etiqueta: "Cuentas", icono: <Users aria-hidden="true" />, badge: cuentas.length }]
      : []),
    {
      id: "configuracion",
      etiqueta: "Configuración",
      icono: <Settings aria-hidden="true" />,
    },
  ];

  const info = TITULOS[seccionVisible];

  return (
    <div className={`panel${lateralAbierto ? "" : " panel-lateral-cerrado"}`}>
      <aside
        className="panel-lateral"
        aria-label={lateralAbierto ? "Barra lateral del panel" : "Barra lateral contraída"}
      >
        <div className="panel-lateral-marca">
          <img src="/chiripa-logo.jpg" alt="" width={40} height={40} />
          {lateralAbierto ? (
            <div>
              <p className="panel-lateral-nombre">CHIRIPA</p>
              <p className="panel-lateral-sub">Panel de control</p>
            </div>
          ) : null}
          <button
            className="panel-lateral-alternar"
            type="button"
            onClick={alternarLateral}
            aria-label={lateralAbierto ? "Contraer la barra lateral" : "Expandir la barra lateral"}
            title={lateralAbierto ? "Contraer" : "Expandir"}
          >
            {lateralAbierto ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
          </button>
        </div>

        <nav className="panel-lateral-nav" aria-label="Secciones del panel">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`panel-lateral-boton${seccionVisible === item.id ? " panel-lateral-boton-activo" : ""}`}
              onClick={() => {
                if (item.id === "biblioteca") {
                  setAlbumFiltro("todos");
                  setArtistaFiltro(null);
                }
                setSeccion(item.id);
              }}
              aria-current={seccionVisible === item.id ? "page" : undefined}
              title={lateralAbierto ? undefined : item.etiqueta}
            >
              {item.icono}
              {lateralAbierto ? <span>{item.etiqueta}</span> : null}
              {item.badge !== undefined && lateralAbierto ? (
                <span className="panel-lateral-badge">{item.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="panel-lateral-pie">
          <Link className="panel-lateral-enlace" href="/">
            <Radio aria-hidden="true" />
            {lateralAbierto ? <span>Ver la radio</span> : null}
          </Link>
          <div className="panel-sesion">
            {quien?.foto ? (
              <img src={quien.foto} alt="" width={32} height={32} />
            ) : (
              <span className="panel-sesion-iniciales" aria-hidden="true">
                {iniciales(quien?.nombre ?? "?")}
              </span>
            )}
            {lateralAbierto ? (
              <div className="panel-sesion-texto">
                <p className="panel-sesion-nombre">{quien?.nombre ?? "Sesión"}</p>
                <p className="panel-sesion-rol">
                  {quien?.tipo === "pin" ? "PIN del dueño" : quien?.rol === "dueno" ? "Dueño" : "Colaborador"}
                </p>
              </div>
            ) : null}
            <button
              className="panel-icono"
              type="button"
              onClick={() => void salir()}
              aria-label="Cerrar la sesión"
              title="Cerrar la sesión"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="panel-principal">
        <header className="panel-cabecera">
          <div>
            <h1 className="panel-cabecera-titulo">{info.titulo}</h1>
            <p className="panel-cabecera-descripcion">{info.descripcion}</p>
          </div>
          {meta ? (
            <p className="panel-cabecera-estado">
              {meta.activas}/{meta.total} en el aire
            </p>
          ) : null}
        </header>

        <main className="panel-cuerpo">
          {seccionVisible === "resumen" ? (
            <Resumen
              canciones={canciones}
              albumes={albumes}
              artistas={artistas}
              meta={meta}
              cuentas={cuentas}
              alAire={alAire}
              oyentes={oyentes}
              historial={historial}
              senal={senalEstado}
              esDueno={esDueno}
              onIrA={irA}
              onRefrescarAire={() => void cargarAire()}
              onDesconexion={() => setConectado(false)}
            />
          ) : null}

          {seccionVisible === "biblioteca" ? (
            <Biblioteca
              canciones={canciones}
              albumes={albumes}
              albumFiltro={albumFiltro}
              setAlbumFiltro={setAlbumFiltro}
              artistaFiltro={artistaFiltro}
              setArtistaFiltro={setArtistaFiltro}
              onRefrescar={() => void cargarBibliotecaYAlbumes()}
              onDesconexion={() => setConectado(false)}
            />
          ) : null}

          {seccionVisible === "albumes" ? (
            <Albumes
              albumes={albumes}
              artistas={artistas}
              canciones={canciones}
              sueltas={sueltas}
              onRefrescar={() => void cargarBibliotecaYAlbumes()}
              onVerCanciones={(albumId) => {
                setArtistaFiltro(null);
                irA("biblioteca", albumId);
              }}
              onVerArtista={irAArtista}
              onDesconexion={() => setConectado(false)}
            />
          ) : null}

          {seccionVisible === "letras" ? (
            <Letras
              canciones={canciones}
              albumes={albumes}
              onRefrescar={() => void cargarBibliotecaYAlbumes()}
              onDesconexion={() => setConectado(false)}
            />
          ) : null}

          {seccionVisible === "cuentas" && esDueno ? (
            <Cuentas
              cuentas={cuentas}
              onRefrescar={() => void cargarCuentas()}
              onDesconexion={() => setConectado(false)}
            />
          ) : null}

          {seccionVisible === "configuracion" ? (
            <Configuracion
              quien={quien}
              meta={meta}
              totalCanciones={canciones.length}
              duracionTotalSeg={canciones.reduce((s, c) => s + c.duracionSeg, 0)}
              onSalir={() => void salir()}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
