"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Album as AlbumIcon,
  Disc3,
  FileText,
  HardDrive,
  Headphones,
  Mic2,
  MoonStar,
  Music2,
  Pause,
  Play,
  Siren,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { pedirGestor } from "./api";
import {
  faltaCuanto,
  formatoDuracion,
  formatoDuracionLarga,
  formatoTamano,
  iniciales,
  type AlAire,
  type AlbumPanel,
  type ArtistaPanel,
  type Cancion,
  type CuentaPanel,
  type EstadoSenal,
  type HistorialOyentes,
  type MetaBiblioteca,
  type NocturnoPanel,
  type Seccion,
} from "./tipos";

const CLAVE_VOLUMEN = "chiripa-monitor-volumen";

/* Audiencia de 24 h: 288 muestras de 5 min en un área SVG, sin librerías. */
function SparklineOyentes({ historial }: { historial: HistorialOyentes | null }) {
  if (!historial || !historial.puntos.length) {
    return (
      <p className="panel-oyentes-vacia">Conectando con la audiencia…</p>
    );
  }
  const puntos = historial.puntos;
  const ancho = 280;
  const alto = 64;
  const tope = Math.max(1, historial.pico);
  const paso = puntos.length > 1 ? ancho / (puntos.length - 1) : ancho;
  const y = (n: number) => alto - 6 - (n / tope) * (alto - 14);
  const linea = puntos.map((p, i) => `${(i * paso).toFixed(1)},${y(p.n).toFixed(1)}`);
  const area = `M0,${alto} L${linea.join(" L")} L${ancho},${alto} Z`;
  const iPico = puntos.reduce((m, p, i) => (p.n > puntos[m].n ? i : m), 0);

  return (
    <svg
      className="panel-oyentes-grafica"
      viewBox={`0 0 ${ancho} ${alto}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Audiencia de las últimas 24 horas: pico de ${historial.pico} oyente${historial.pico === 1 ? "" : "s"}, promedio de ${historial.promedio}.`}
    >
      <defs>
        <linearGradient id="panelOyentesArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--p-acento)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--p-acento)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="panel-oyentes-area" d={area} fill="url(#panelOyentesArea)" />
      <polyline
        className="panel-oyentes-linea"
        points={linea.join(" ")}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {historial.pico > 0 ? (
        <circle
          className="panel-oyentes-pico"
          cx={(iPico * paso).toFixed(1)}
          cy={y(puntos[iPico].n).toFixed(1)}
          r="2.6"
        />
      ) : null}
    </svg>
  );
}

function ControlAlAire({
  alAire,
  senal,
  onRefrescarAire,
  onDesconexion,
}: {
  alAire: AlAire | null;
  senal: EstadoSenal | null;
  onRefrescarAire: () => void;
  onDesconexion: () => void;
}) {
  /* ── Escucha de control: monitoreo de la señal con su propio volumen ── */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pistaRef = useRef<string | null>(null);
  const [monitoreando, setMonitoreando] = useState(false);
  const [volumen, setVolumen] = useState(0.8);
  const [avisoMonitor, setAvisoMonitor] = useState("");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_VOLUMEN);
      if (guardado !== null) {
        const valor = Number(guardado);
        if (valor >= 0 && valor <= 1) setVolumen(valor);
      }
    } catch {
      /* sin memoria: 80 %, como una consola recién encendida */
    }
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      pistaRef.current = null;
    };
  }, []);

  const offsetSeg = (): number => {
    if (!alAire?.empezoISO) return 0;
    const ms = Date.now() - Date.parse(alAire.empezoISO);
    if (!Number.isFinite(ms) || ms < 0) return 0;
    const tope = alAire.duracionSeg ? alAire.duracionSeg - 1 : ms / 1000;
    return Math.max(0, Math.min(ms / 1000, tope));
  };

  const alternarMonitor = async () => {
    if (!alAire?.audioUrl) return;
    if (monitoreando) {
      audioRef.current?.pause();
      setMonitoreando(false);
      return;
    }
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.preload = "none";
      audioRef.current = audio;
    }
    audio.src = alAire.audioUrl;
    audio.volume = volumen;
    pistaRef.current = alAire.id;
    try {
      await audio.play();
      const offset = offsetSeg();
      if (offset > 0) {
        try {
          audio.currentTime = offset;
        } catch {
          /* el navegador encuadra cuando cargue los metadatos */
        }
      }
      setMonitoreando(true);
      setAvisoMonitor("");
    } catch {
      setAvisoMonitor("El navegador bloqueó el audio: vuelve a tocar escuchar.");
    }
  };

  // Cambio de pista al aire (o pérdida de señal) mientras se monitorea.
  useEffect(() => {
    const audio = audioRef.current;
    if (!monitoreando || !audio) return;
    if (!alAire?.audioUrl) {
      audio.pause();
      setMonitoreando(false);
      return;
    }
    if (pistaRef.current === alAire.id) {
      const offset = offsetSeg();
      if (Math.abs(audio.currentTime - offset) > 6) {
        try {
          audio.currentTime = offset;
        } catch {
          /* encuadre suave: si no se puede, la pista sigue */
        }
      }
      return;
    }
    audio.src = alAire.audioUrl;
    pistaRef.current = alAire.id;
    audio.volume = volumen;
    audio.play().catch(() => setMonitoreando(false));
    const offset = offsetSeg();
    if (offset > 0) {
      try {
        audio.currentTime = offset;
      } catch {
        /* encuadre al cargar */
      }
    }
  }, [alAire?.id, alAire?.audioUrl, monitoreando]);

  const cambiarVolumen = (valor: number) => {
    setVolumen(valor);
    if (audioRef.current) audioRef.current.volume = valor;
    try {
      localStorage.setItem(CLAVE_VOLUMEN, String(valor));
    } catch {
      /* sin memoria */
    }
  };

  /* ── Silencio de emergencia: confirmación en dos pasos ── */
  const [armado, setArmado] = useState(false);
  const [duracion, setDuracion] = useState<number>(15);
  const [trabajando, setTrabajando] = useState(false);
  const [avisoPanico, setAvisoPanico] = useState("");

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 5000);
    return () => clearTimeout(t);
  }, [armado]);

  const mandar = async (cuerpo: Record<string, unknown>) => {
    setTrabajando(true);
    const res = await pedirGestor("/api/radio/senal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    setTrabajando(false);
    if (!res) {
      onDesconexion();
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      aviso?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { error: data.error ?? "No se pudo cambiar la señal." };
    }
    onRefrescarAire();
    return { aviso: data.aviso ?? "" };
  };

  const silenciar = async () => {
    if (!armado) {
      setArmado(true);
      return;
    }
    const r = await mandar({
      accion: "panico",
      minutos: duracion > 0 ? duracion : undefined,
    });
    setArmado(false);
    if (!r) return;
    setAvisoPanico(r.error ?? r.aviso);
  };

  const reactivar = async () => {
    const r = await mandar({ accion: "reactivar" });
    if (!r) return;
    setAvisoPanico(r.error ?? r.aviso);
  };

  /* ── Silencio nocturno programado ── */
  const [nocturno, setNocturno] = useState<NocturnoPanel>(
    senal?.nocturno ?? { activo: false, desde: "23:00", hasta: "06:00" },
  );
  const [guardandoNocturno, setGuardandoNocturno] = useState(false);
  const [avisoNocturno, setAvisoNocturno] = useState("");

  useEffect(() => {
    if (senal?.nocturno) setNocturno(senal.nocturno);
  }, [senal?.nocturno]);

  const guardarNocturno = async () => {
    setGuardandoNocturno(true);
    const r = await mandar({
      accion: "nocturno",
      activo: nocturno.activo,
      desde: nocturno.desde,
      hasta: nocturno.hasta,
    });
    setGuardandoNocturno(false);
    if (!r) return;
    setAvisoNocturno(r.error ?? r.aviso);
  };

  const silenciada = !!senal?.silenciada;
  const reanudacion = senal?.reanudacionISO;

  return (
    <div className="panel-control" aria-label="Control al aire">
      {/* Escucha de control */}
      <section className="panel-tarjeta panel-control-tarjeta" aria-label="Escucha de control">
        <h2 className="panel-tarjeta-titulo">
          <Headphones aria-hidden="true" />
          Escucha de control
        </h2>
        <div className="panel-monitor">
          <button
            className="panel-monitor-boton"
            type="button"
            onClick={() => void alternarMonitor()}
            disabled={!alAire?.audioUrl || !!avisoMonitor}
            aria-label={monitoreando ? "Pausar la escucha" : "Escuchar la señal"}
            title={monitoreando ? "Pausar la escucha" : "Escuchar la señal"}
          >
            {monitoreando ? (
              <Pause aria-hidden="true" fill="currentColor" />
            ) : (
              <Play aria-hidden="true" fill="currentColor" />
            )}
          </button>
          <div className="panel-monitor-estado">
            <p className="panel-monitor-texto">
              {monitoreando
                ? "Escuchando la señal"
                : alAire
                  ? "Monitoreo en pausa"
                  : "La señal está apagada"}
            </p>
            <div className="panel-monitor-volumen">
              {volumen === 0 ? (
                <VolumeX aria-hidden="true" />
              ) : (
                <Volume2 aria-hidden="true" />
              )}
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volumen * 100)}
                onChange={(e) => cambiarVolumen(Number(e.target.value) / 100)}
                aria-label="Volumen de la escucha de control"
                disabled={!alAire?.audioUrl}
              />
              <span className="panel-monitor-porcentaje">
                {Math.round(volumen * 100)}%
              </span>
            </div>
          </div>
        </div>
        <p className="panel-control-nota">
          {avisoMonitor
            ? avisoMonitor
            : "El volumen solo cambia tu monitoreo, no lo que oyen los demás."}
        </p>
      </section>

      {/* Silencio de emergencia */}
      <section
        className={`panel-tarjeta panel-control-tarjeta${silenciada && senal?.motivo === "emergencia" ? " panel-control-alerta" : ""}`}
        aria-label="Silencio de emergencia"
      >
        <h2 className="panel-tarjeta-titulo">
          <Siren aria-hidden="true" />
          Silencio de emergencia
        </h2>
        {silenciada ? (
          <>
            <p className="panel-panico-estado">
              <span className="panel-pill panel-pill-roja">
                <span className="panel-punto panel-punto-rojo" aria-hidden="true" />
                Silenciada
              </span>
              {reanudacion ? (
                <span className="panel-control-reanuda">
                  vuelve {faltaCuanto(reanudacion)}
                </span>
              ) : (
                <span className="panel-control-reanuda">hasta que la reactives</span>
              )}
            </p>
            <button
              className="panel-boton panel-boton-primario panel-panico-reactivar"
              type="button"
              onClick={() => void reactivar()}
              disabled={trabajando}
            >
              Reactivar la señal
            </button>
          </>
        ) : (
          <>
            <div className="panel-panico-duracion" role="radiogroup" aria-label="Duración del silencio">
              {[
                { v: 15, texto: "15 min" },
                { v: 60, texto: "1 h" },
                { v: 0, texto: "A mano" },
              ].map((opcion) => (
                <button
                  key={opcion.v}
                  type="button"
                  role="radio"
                  aria-checked={duracion === opcion.v}
                  className={`panel-panico-opcion${duracion === opcion.v ? " panel-panico-opcion-activa" : ""}`}
                  onClick={() => setDuracion(opcion.v)}
                >
                  {opcion.texto}
                </button>
              ))}
            </div>
            <button
              className={`panel-panico-boton${armado ? " panel-panico-boton-armado" : ""}`}
              type="button"
              onClick={() => void silenciar()}
              disabled={trabajando}
            >
              <Siren aria-hidden="true" />
              {armado ? "¿Confirmar el silencio?" : "Silenciar la señal"}
            </button>
            <p className="panel-control-nota">
              {armado
                ? "Toca otra vez para cortar el audio de todos los oyentes."
                : "Corta la señal al instante; la rotación reanuda donde iba."}
            </p>
          </>
        )}
        {avisoPanico ? <p className="panel-control-aviso" role="status">{avisoPanico}</p> : null}
      </section>

      {/* Silencio nocturno */}
      <section className="panel-tarjeta panel-control-tarjeta" aria-label="Silencio nocturno">
        <h2 className="panel-tarjeta-titulo">
          <MoonStar aria-hidden="true" />
          Silencio nocturno
        </h2>
        <div className="panel-nocturno-fila">
          <div>
            <p className="panel-nocturno-titulo">Programado</p>
            <p className="panel-nocturno-nota">
              {senal?.silenciada && senal.motivo === "nocturno"
                ? `Silencio activo: vuelve ${faltaCuanto(reanudacion)}.`
                : nocturno.activo
                  ? `De ${nocturno.desde} a ${nocturno.hasta}, todas las noches.`
                  : "La radio suena las 24 horas."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={nocturno.activo}
            aria-label="Silencio nocturno programado"
            className={`panel-config-switch${nocturno.activo ? " panel-config-switch-activo" : ""}`}
            onClick={() => setNocturno((n) => ({ ...n, activo: !n.activo }))}
          >
            <span aria-hidden="true" />
          </button>
        </div>
        <div className="panel-nocturno-horario">
          <label>
            <span>Desde</span>
            <input
              type="time"
              value={nocturno.desde}
              onChange={(e) => setNocturno((n) => ({ ...n, desde: e.target.value }))}
              disabled={!nocturno.activo}
            />
          </label>
          <label>
            <span>Hasta</span>
            <input
              type="time"
              value={nocturno.hasta}
              onChange={(e) => setNocturno((n) => ({ ...n, hasta: e.target.value }))}
              disabled={!nocturno.activo}
            />
          </label>
          <button
            className="panel-boton"
            type="button"
            onClick={() => void guardarNocturno()}
            disabled={guardandoNocturno}
          >
            {guardandoNocturno ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <p className="panel-control-nota">Horario en hora de Mazatlán.</p>
        {avisoNocturno ? <p className="panel-control-aviso" role="status">{avisoNocturno}</p> : null}
      </section>
    </div>
  );
}

export function Resumen({
  canciones,
  albumes,
  artistas,
  meta,
  cuentas,
  alAire,
  oyentes,
  historial,
  senal,
  esDueno,
  onIrA,
  onRefrescarAire,
  onDesconexion,
}: {
  canciones: Cancion[];
  albumes: AlbumPanel[];
  artistas: ArtistaPanel[];
  meta: MetaBiblioteca | null;
  cuentas: CuentaPanel[];
  alAire: AlAire | null;
  oyentes: number | null;
  historial: HistorialOyentes | null;
  senal: EstadoSenal | null;
  esDueno: boolean;
  onIrA: (seccion: Seccion, albumId?: string | null) => void;
  onRefrescarAire: () => void;
  onDesconexion: () => void;
}) {
  const conLetra = canciones.filter((c) => c.conLetra).length;
  const instrumentales = canciones.filter((c) => c.instrumental).length;
  const sueltas = canciones.filter((c) => !c.albumId).length;
  const activas = meta?.activas ?? canciones.filter((c) => c.activa).length;
  const ultimas = [...canciones]
    .sort((a, b) => b.subidoISO.localeCompare(a.subidoISO))
    .slice(0, 5);

  const conteo = [
    ...albumes.map((a) => ({ nombre: a.nombre, n: a.canciones, id: a.id })),
    { nombre: "Sin álbum", n: sueltas, id: null as string | null },
  ].sort((a, b) => b.n - a.n);
  const maximo = Math.max(1, ...conteo.map((c) => c.n));

  const silenciada = !!senal?.silenciada;

  return (
    <div className="panel-resumen">
      <section className="panel-senal" aria-label="Estado de la señal">
        <div className="panel-senal-info">
          <p className="panel-senal-titulo">
            <Activity aria-hidden="true" />
            La señal
          </p>
          {alAire ? (
            <>
              <div className="panel-senal-cancion">
                {alAire.portada ? (
                  <img src={alAire.portada} alt="" width={64} height={64} />
                ) : (
                  <span className="panel-senal-sin-portada" aria-hidden="true">
                    <Disc3 />
                  </span>
                )}
                <div>
                  <h3>{alAire.titulo}</h3>
                  <p>
                    {alAire.artista}
                    {alAire.album ? ` · ${alAire.album}` : ""}
                  </p>
                </div>
              </div>
              <span className="panel-pill panel-pill-verde">
                <span className="panel-punto panel-punto-verde panel-punto-latido" aria-hidden="true" />
                Al aire
              </span>
            </>
          ) : silenciada ? (
            <>
              <p className="panel-senal-apagada">
                {senal?.motivo === "nocturno"
                  ? `Silencio nocturno programado (${senal.nocturno.desde}–${senal.nocturno.hasta}, hora de Mazatlán).`
                  : "Silencio de emergencia activo: la señal está cortada para todos los oyentes."}{" "}
                {senal?.reanudacionISO
                  ? `Vuelve ${faltaCuanto(senal.reanudacionISO)}.`
                  : "Reactívala desde el control de la señal."}
              </p>
              <span className="panel-pill panel-pill-roja">
                <span className="panel-punto panel-punto-rojo" aria-hidden="true" />
                Silenciada
              </span>
            </>
          ) : (
            <>
              <p className="panel-senal-apagada">
                La señal está apagada: no hay canciones activas en la rotación.
              </p>
              <button
                className="panel-boton"
                type="button"
                onClick={() => onIrA("biblioteca")}
              >
                Activar canciones
              </button>
            </>
          )}
        </div>
        <div className="panel-senal-audiencia">
          <p className="panel-senal-dato-numero">
            {oyentes ?? "—"}
            <span className="panel-senal-dato-texto">
              oyente{oyentes === 1 ? "" : "s"} ahora
            </span>
          </p>
          <SparklineOyentes historial={historial} />
          {historial ? (
            <p className="panel-senal-audiencia-datos">
              <span>hace 24 h</span>
              <span>
                pico {historial.pico} · promedio {historial.promedio}
              </span>
              <span>ahora</span>
            </p>
          ) : null}
        </div>
      </section>

      <ControlAlAire
        alAire={alAire}
        senal={senal}
        onRefrescarAire={onRefrescarAire}
        onDesconexion={onDesconexion}
      />

      <div className="panel-metricas">
        <article className="panel-metrica">
          <p className="panel-metrica-marca">
            <Music2 aria-hidden="true" />
            Canciones
          </p>
          <p className="panel-metrica-numero">{canciones.length}</p>
          <p className="panel-metrica-detalle">
            {activas} en rotación ·{" "}
            {canciones.length - activas} en pausa
          </p>
        </article>

        <article className="panel-metrica">
          <p className="panel-metrica-marca">
            <AlbumIcon aria-hidden="true" />
            Álbumes
          </p>
          <p className="panel-metrica-numero">{albumes.length}</p>
          <p className="panel-metrica-detalle">{sueltas} canciones sueltas</p>
        </article>

        <article className="panel-metrica">
          <p className="panel-metrica-marca">
            <Mic2 aria-hidden="true" />
            Artistas
          </p>
          <p className="panel-metrica-numero">{artistas.length}</p>
          <p className="panel-metrica-detalle">
            {artistas.slice(0, 2).map((a) => a.nombre).join(" · ")}
            {artistas.length > 2 ? ` y ${artistas.length - 2} más` : ""}
          </p>
        </article>

        <article className="panel-metrica">
          <p className="panel-metrica-marca">
            <FileText aria-hidden="true" />
            Letras
          </p>
          <p className="panel-metrica-numero">
            {conLetra}
            <span className="panel-metrica-division">/</span>
            {canciones.length}
          </p>
          <p className="panel-metrica-detalle">
            {canciones.length - conLetra} sin letra
            {instrumentales ? ` · ${instrumentales} instrumental${instrumentales === 1 ? "" : "es"}` : ""}
          </p>
        </article>

        <article className="panel-metrica">
          <p className="panel-metrica-marca">
            <HardDrive aria-hidden="true" />
            Almacén
          </p>
          <p className="panel-metrica-numero">
            {formatoTamano(meta?.tamanoBytes ?? 0)}
          </p>
          <p className="panel-metrica-detalle">
            {formatoDuracionLarga(
              canciones.reduce((s, c) => s + c.duracionSeg, 0),
            )}{" "}
            de música
          </p>
        </article>

        {esDueno ? (
          <article className="panel-metrica">
            <p className="panel-metrica-marca">
              <Users aria-hidden="true" />
              Cuentas
            </p>
            <p className="panel-metrica-numero">{cuentas.length}</p>
            <p className="panel-metrica-detalle">
              {cuentas.filter((c) => c.activo).length} activas ·{" "}
              {cuentas.filter((c) => c.rol === "dueno").length} dueño
            </p>
          </article>
        ) : null}
      </div>

      <div className="panel-resumen-columnas">
        <section className="panel-tarjeta" aria-label="Canciones por álbum">
          <h2 className="panel-tarjeta-titulo">Canciones por álbum</h2>
          {conteo.length ? (
            <ul className="panel-grafica">
              {conteo.map((grupo) => (
                <li key={grupo.nombre}>
                  <button
                    type="button"
                    className="panel-grafica-fila"
                    onClick={() => onIrA("biblioteca", grupo.id)}
                    title={`Ver las ${grupo.n} canciones de ${grupo.nombre}`}
                  >
                    <span className="panel-grafica-nombre">{grupo.nombre}</span>
                    <span className="panel-grafica-pista">
                      <span
                        className="panel-grafica-barra"
                        style={{ width: `${Math.max(6, (grupo.n / maximo) * 100)}%` }}
                      />
                    </span>
                    <span className="panel-grafica-numero">{grupo.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-vacio-chico">
              Aún no hay álbumes ni canciones que contar.
            </p>
          )}
        </section>

        <section className="panel-tarjeta" aria-label="Últimas subidas">
          <h2 className="panel-tarjeta-titulo">Últimas subidas</h2>
          {ultimas.length ? (
            <ul className="panel-ultimas">
              {ultimas.map((cancion) => {
                const album = albumes.find((a) => a.id === cancion.albumId);
                return (
                  <li key={cancion.id} className="panel-ultima">
                    <span className="panel-ultima-portada" aria-hidden="true">
                      {cancion.portada ? (
                        <img src={cancion.portada} alt="" width={40} height={40} />
                      ) : (
                        <span className="panel-ultima-iniciales">
                          {iniciales(cancion.titulo)}
                        </span>
                      )}
                    </span>
                    <span className="panel-ultima-datos">
                      <span className="panel-ultima-titulo">{cancion.titulo}</span>
                      <span className="panel-ultima-meta">
                        {cancion.artista}
                        {album ? ` · ${album.nombre}` : ""}
                      </span>
                    </span>
                    <span className="panel-ultima-derecha">
                      <span className="panel-ultima-duracion">
                        {formatoDuracion(cancion.duracionSeg)}
                      </span>
                      <span
                        className={`panel-pill ${cancion.activa ? "panel-pill-verde" : "panel-pill-gris"}`}
                      >
                        {cancion.activa ? "Al aire" : "En pausa"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="panel-vacio-chico">
              Todavía no hay canciones: sube la primera en la Biblioteca.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
