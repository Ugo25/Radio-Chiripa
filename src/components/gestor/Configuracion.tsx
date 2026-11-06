"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LayoutList,
  LogOut,
  Moon,
  Palette,
  Plus,
  Radio,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sun,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { cabeceraLlave, guardarToken } from "@/lib/llave-cliente";
import { FESTIVAL } from "@/lib/festival";
import { adivinarIcono, ICONOS_RED, type Red } from "@/lib/redes-compartir";
import type { InformeRespaldo } from "@/lib/respaldo";
import { pedirGestor } from "./api";
import {
  formatoDuracionLarga,
  formatoTamano,
  iniciales,
  type MetaBiblioteca,
  type Quien,
} from "./tipos";

type ConfigResp = {
  version?: string;
  pinPersonalizado?: boolean;
  pinDelEntorno?: boolean;
  loginPinDisponible?: boolean;
};

const CLAVE_LATERAL = "chiripa-panel-lateral";
const CLAVE_DENSO = "chiripa-panel-denso";
const CLAVE_TEMA = "chiripa-panel-tema";

/** Aplica el tema del panel (negro o blanco) sin recargar. */
export function aplicarTemaPanel(tema: "oscuro" | "claro") {
  document.documentElement.classList.toggle("panel-claro", tema === "claro");
}

export function Configuracion({
  quien,
  meta,
  totalCanciones,
  duracionTotalSeg,
  onSalir,
}: {
  quien: Quien | null;
  meta: MetaBiblioteca | null;
  totalCanciones: number;
  duracionTotalSeg: number;
  onSalir: () => void;
}) {
  const esDueno = quien?.rol === "dueno";

  const [config, setConfig] = useState<ConfigResp | null>(null);
  useEffect(() => {
    pedirGestor("/api/biblioteca/config").then(async (res) => {
      if (res?.ok) setConfig((await res.json()) as ConfigResp);
    });
  }, []);

  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinConfirmar, setPinConfirmar] = useState("");
  const [verPin, setVerPin] = useState(false);
  const [cambiandoPin, setCambiandoPin] = useState(false);
  const [pinAviso, setPinAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cambiarPin = async () => {
    if (pinNuevo.length < 6) {
      setPinAviso({ tipo: "error", texto: "El PIN nuevo necesita al menos 6 caracteres." });
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setPinAviso({ tipo: "error", texto: "El PIN nuevo y su confirmación no coinciden." });
      return;
    }
    setCambiandoPin(true);
    setPinAviso(null);
    const res = await pedirGestor("/api/biblioteca/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinActual, pinNuevo }),
    });
    setCambiandoPin(false);
    if (!res) {
      setPinAviso({ tipo: "error", texto: "La sesión expiró: vuelve a entrar." });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      token?: string;
      aviso?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      setPinAviso({ tipo: "error", texto: data.error ?? "No se pudo cambiar el PIN." });
      return;
    }
    if (data.token) guardarToken(data.token);
    setPinActual("");
    setPinNuevo("");
    setPinConfirmar("");
    setPinAviso({
      tipo: "ok",
      texto: data.aviso ?? "PIN cambiado: las demás sesiones quedaron cerradas.",
    });
    setConfig((c) => (c ? { ...c, pinPersonalizado: true } : c));
  };

  const [lateral, setLateral] = useState<"abierto" | "cerrado">("abierto");
  const [denso, setDenso] = useState(false);
  const [tema, setTema] = useState<"oscuro" | "claro">("oscuro");
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_LATERAL);
      if (guardado === "cerrado" || guardado === "abierto") setLateral(guardado);
      setDenso(localStorage.getItem(CLAVE_DENSO) === "1");
      if (localStorage.getItem(CLAVE_TEMA) === "claro") setTema("claro");
    } catch {
      /* sin memoria: valores por defecto */
    }
  }, []);

  const aplicarLateral = (valor: "abierto" | "cerrado") => {
    setLateral(valor);
    try {
      localStorage.setItem(CLAVE_LATERAL, valor);
    } catch {
      /* sin memoria */
    }
    window.dispatchEvent(new CustomEvent("chiripa-lateral", { detail: valor }));
  };

  const aplicarDenso = (valor: boolean) => {
    setDenso(valor);
    try {
      localStorage.setItem(CLAVE_DENSO, valor ? "1" : "0");
    } catch {
      /* sin memoria */
    }
    document.documentElement.classList.toggle("panel-denso", valor);
  };

  const aplicarTema = (valor: "oscuro" | "claro") => {
    setTema(valor);
    try {
      localStorage.setItem(CLAVE_TEMA, valor);
    } catch {
      /* sin memoria */
    }
    aplicarTemaPanel(valor);
  };

  const exportar = async () => {
    const res = await pedirGestor("/api/biblioteca");
    if (!res || !res.ok) return;
    const texto = JSON.stringify(await res.json(), null, 2);
    const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `chiripa-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarRespaldo = async () => {
    setAvisoRespaldo(null);
    const res = await pedirGestor("/api/biblioteca/respaldo");
    if (!res || !res.ok) {
      setAvisoRespaldo({ tipo: "error", texto: "No se pudo armar el respaldo completo." });
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `chiripa-respaldo-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [informeImportacion, setInformeImportacion] = useState<InformeRespaldo | null>(null);
  const [avisoRespaldo, setAvisoRespaldo] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  /* Redes sociales y sitios: se muestran en el reproductor y en Sobre Chiripa. */
  const [redes, setRedes] = useState<Red[]>([]);
  const [redesCargadas, setRedesCargadas] = useState(false);
  const [guardandoRedes, setGuardandoRedes] = useState(false);
  const [avisoRedes, setAvisoRedes] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (!esDueno) return;
    pedirGestor("/api/biblioteca/redes").then(async (res) => {
      if (res?.ok) {
        const data = (await res.json().catch(() => null)) as { redes?: Red[] } | null;
        setRedes(Array.isArray(data?.redes) ? data.redes : []);
      }
      setRedesCargadas(true);
    });
  }, [esDueno]);

  const cambiarRed = (i: number, cambio: Partial<Red>) => {
    setRedes((lista) =>
      lista.map((red, j) => {
        if (j !== i) return red;
        const nueva = { ...red, ...cambio };
        // El icono se adivina del dominio mientras no se haya elegido a mano.
        if (cambio.url !== undefined && red.icono === adivinarIcono(red.url)) {
          nueva.icono = adivinarIcono(nueva.url);
        }
        return nueva;
      }),
    );
    setAvisoRedes(null);
  };

  const guardarRedes = async () => {
    setGuardandoRedes(true);
    setAvisoRedes(null);
    const res = await pedirGestor("/api/biblioteca/redes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redes }),
    });
    setGuardandoRedes(false);
    if (!res) {
      setAvisoRedes({ tipo: "error", texto: "La sesión expiró: vuelve a entrar." });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redes?: Red[]; error?: string };
    if (!res.ok || !data.ok) {
      setAvisoRedes({ tipo: "error", texto: data.error ?? "No se pudieron guardar las redes." });
      return;
    }
    setRedes(data.redes ?? []);
    setAvisoRedes({
      tipo: "ok",
      texto: "Redes guardadas: ya se ven en la radio (recargada) y en Sobre Chiripa.",
    });
  };

  const importarRespaldo = async (archivo: File) => {
    setImportando(true);
    setInformeImportacion(null);
    setAvisoRespaldo(null);
    const forma = new FormData();
    forma.append("respaldo", archivo);
    const res = await pedirGestor("/api/biblioteca/respaldo", {
      method: "POST",
      body: forma,
    });
    setImportando(false);
    if (!res) {
      setAvisoRespaldo({ tipo: "error", texto: "La sesión expiró: vuelve a entrar." });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      informe?: InformeRespaldo;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.informe) {
      setAvisoRespaldo({ tipo: "error", texto: data.error ?? "No se pudo importar el respaldo." });
      return;
    }
    setInformeImportacion(data.informe);
  };

  return (
    <div className="panel-config">
      <section className="panel-tarjeta" aria-label="Cuenta y acceso">
        <h2 className="panel-tarjeta-titulo">
          <ShieldCheck aria-hidden="true" />
          Cuenta y acceso
        </h2>

        <div className="panel-config-sesion">
          {quien?.foto ? (
            <img src={quien.foto} alt="" width={48} height={48} />
          ) : (
            <span className="panel-config-avatar" aria-hidden="true">
              {iniciales(quien?.nombre ?? "?")}
            </span>
          )}
          <div>
            <p className="panel-config-nombre">{quien?.nombre ?? "Sesión"}</p>
            <p className="panel-config-rol">
              {quien?.tipo === "pin"
                ? "Dueño de la radio · PIN maestro"
                : quien?.rol === "dueno"
                  ? "Cuenta con poderes de dueño"
                  : "Cuenta colaboradora"}
            </p>
          </div>
          <button className="panel-boton" type="button" onClick={onSalir}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>

        {esDueno ? (
          <div className="panel-config-pin">
            <p className="panel-config-subtitulo">
              <KeyRound aria-hidden="true" />
              Cambiar el PIN maestro
            </p>
            <div className="panel-edicion">
              <div className="panel-campo">
                <label htmlFor="pin-actual">PIN actual</label>
                <input
                  id="pin-actual"
                  type={verPin ? "text" : "password"}
                  value={pinActual}
                  onChange={(e) => setPinActual(e.target.value)}
                  autoComplete="current-password"
                  placeholder="El que abre el panel hoy"
                />
              </div>
              <div className="panel-campo">
                <label htmlFor="pin-nuevo">PIN nuevo</label>
                <input
                  id="pin-nuevo"
                  type={verPin ? "text" : "password"}
                  value={pinNuevo}
                  onChange={(e) => setPinNuevo(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="panel-campo">
                <label htmlFor="pin-confirmar">Confirmar el nuevo</label>
                <input
                  id="pin-confirmar"
                  type={verPin ? "text" : "password"}
                  value={pinConfirmar}
                  onChange={(e) => setPinConfirmar(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Otra vez, para no equivocarse"
                />
              </div>
              <div className="panel-config-pin-acciones">
                <button
                  className="panel-icono"
                  type="button"
                  onClick={() => setVerPin((v) => !v)}
                  aria-label={verPin ? "Ocultar los PIN" : "Mostrar los PIN"}
                  title={verPin ? "Ocultar" : "Mostrar"}
                >
                  {verPin ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
                <button
                  className="panel-boton panel-boton-primario"
                  type="button"
                  onClick={() => void cambiarPin()}
                  disabled={cambiandoPin || !pinActual || !pinNuevo}
                >
                  <Check aria-hidden="true" />
                  {cambiandoPin ? "Cambiando…" : "Cambiar el PIN"}
                </button>
              </div>
            </div>
            {pinAviso ? (
              <p className={`panel-config-aviso${pinAviso.tipo === "error" ? " panel-config-aviso-error" : ""}`}>
                {pinAviso.texto}
              </p>
            ) : (
              <p className="panel-config-nota">
                El PIN se guarda cifrado (scrypt + sal). Cambiarlo cierra todas las
                demás sesiones — las cuentas del panel vuelven a entrar con su
                contraseña.
                {config?.pinPersonalizado
                  ? " Ahora usas un PIN propio, cambiado desde aquí."
                  : config?.pinDelEntorno
                    ? " Ahora mismo usas el PIN del archivo .env.local (GESTOR_PIN)."
                    : ""}
              </p>
            )}
          </div>
        ) : (
          <p className="panel-config-nota">
            La contraseña de tu cuenta la cambia el dueño desde el apartado Cuentas.
          </p>
        )}
      </section>

      <section className="panel-tarjeta" aria-label="Apariencia">
        <h2 className="panel-tarjeta-titulo">
          <Palette aria-hidden="true" />
          Apariencia
        </h2>

        <div className="panel-config-fila">
          <div>
            <p className="panel-config-fila-titulo">Tema del panel</p>
            <p className="panel-config-fila-nota">
              Negro de serie; el blanco para el detalle a plena luz.
            </p>
          </div>
          <div className="panel-config-segmento" role="radiogroup" aria-label="Tema del panel">
            <button
              type="button"
              role="radio"
              aria-checked={tema === "oscuro"}
              className={tema === "oscuro" ? "panel-config-segmento-activa" : undefined}
              onClick={() => aplicarTema("oscuro")}
            >
              <Moon aria-hidden="true" />
              Negro
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={tema === "claro"}
              className={tema === "claro" ? "panel-config-segmento-activa" : undefined}
              onClick={() => aplicarTema("claro")}
            >
              <Sun aria-hidden="true" />
              Blanco
            </button>
          </div>
        </div>

        <div className="panel-config-fila">
          <div>
            <p className="panel-config-fila-titulo">Barra lateral</p>
            <p className="panel-config-fila-nota">Expandida o solo el riel de iconos.</p>
          </div>
          <div className="panel-config-segmento" role="radiogroup" aria-label="Barra lateral">
            <button
              type="button"
              role="radio"
              aria-checked={lateral === "abierto"}
              className={lateral === "abierto" ? "panel-config-segmento-activa" : undefined}
              onClick={() => aplicarLateral("abierto")}
            >
              <LayoutList aria-hidden="true" />
              Expandida
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={lateral === "cerrado"}
              className={lateral === "cerrado" ? "panel-config-segmento-activa" : undefined}
              onClick={() => aplicarLateral("cerrado")}
            >
              <Table2 aria-hidden="true" />
              Riel
            </button>
          </div>
        </div>

        <div className="panel-config-fila">
          <div>
            <p className="panel-config-fila-titulo">Lista compacta</p>
            <p className="panel-config-fila-nota">
              Menos aire entre canciones: caben más filas de un vistazo.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={denso}
            className={`panel-config-switch${denso ? " panel-config-switch-activo" : ""}`}
            onClick={() => aplicarDenso(!denso)}
            aria-label="Lista compacta"
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="panel-tarjeta" aria-label="Datos">
        <h2 className="panel-tarjeta-titulo">
          <Download aria-hidden="true" />
          Datos
        </h2>
        <div className="panel-config-datos">
          <p>
            {totalCanciones} {totalCanciones === 1 ? "canción" : "canciones"} ·{" "}
            {formatoDuracionLarga(duracionTotalSeg)} de música ·{" "}
            {formatoTamano(meta?.tamanoBytes ?? 0)} en disco
          </p>
          <div className="panel-config-acciones">
            <button className="panel-boton" type="button" onClick={() => void exportar()}>
              <Download aria-hidden="true" />
              Biblioteca (JSON)
            </button>
            {esDueno ? (
              <button
                className="panel-boton panel-boton-primario"
                type="button"
                onClick={() => void descargarRespaldo()}
              >
                <Archive aria-hidden="true" />
                Respaldo completo (ZIP)
              </button>
            ) : null}
          </div>
          <p className="panel-config-nota">
            El ZIP trae todo lo que no es audio: letras (también las pegadas a
            mano), álbumes, cuentas, silencio nocturno, audiencia, imágenes y un
            .txt por letra para leerlas a mano. El audio se respalda copiando
            media/biblioteca/ — eso, junto con este ZIP, ES la radio completa.
          </p>

          {esDueno ? (
            <div className="panel-config-importar">
              <p className="panel-config-subtitulo">
                <Upload aria-hidden="true" />
                Importar respaldo
              </p>
              <p className="panel-config-nota">
                Acepta el ZIP completo o el JSON de la biblioteca. Empareja por
                huella digital: si re-subiste las canciones desde cero, letras,
                álbumes y datos se re-attach solos. El PIN y las sesiones no se
                tocan.
              </p>
              <input
                ref={entradaArchivo}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                hidden
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = "";
                  if (archivo) void importarRespaldo(archivo);
                }}
              />
              <button
                className="panel-boton"
                type="button"
                disabled={importando}
                onClick={() => entradaArchivo.current?.click()}
              >
                <Upload aria-hidden="true" />
                {importando ? "Importando…" : "Elegir archivo…"}
              </button>

              {avisoRespaldo ? (
                <p
                  className={`panel-config-aviso${avisoRespaldo.tipo === "error" ? " panel-config-aviso-error" : ""}`}
                >
                  {avisoRespaldo.texto}
                </p>
              ) : null}

              {informeImportacion ? (
                <div className="panel-config-importar-informe">
                  <p>{informeImportacion.aviso}</p>
                  <ul>
                    {informeImportacion.cancionesRestauradas ? (
                      <li>{informeImportacion.cancionesRestauradas} canciones de vuelta al índice</li>
                    ) : null}
                    {informeImportacion.metadatosAplicados ? (
                      <li>{informeImportacion.metadatosAplicados} canciones con datos recuperados</li>
                    ) : null}
                    {informeImportacion.letrasVinculadas ? (
                      <li>{informeImportacion.letrasVinculadas} letras vinculadas</li>
                    ) : null}
                    {informeImportacion.letrasYaEstaban ? (
                      <li>{informeImportacion.letrasYaEstaban} letras que ya estaban al día</li>
                    ) : null}
                    {informeImportacion.albumesRestaurados ? (
                      <li>{informeImportacion.albumesRestaurados} álbumes</li>
                    ) : null}
                    {informeImportacion.cuentasRecuperadas ? (
                      <li>{informeImportacion.cuentasRecuperadas} cuentas recuperadas</li>
                    ) : null}
                    {informeImportacion.imagenesEscritas ? (
                      <li>{informeImportacion.imagenesEscritas} imágenes</li>
                    ) : null}
                    {informeImportacion.silencioNocturnoRestaurado ? (
                      <li>Silencio nocturno restaurado</li>
                    ) : null}
                    {informeImportacion.historialFusionado ? <li>Historial de oyentes fusionado</li> : null}
                    {informeImportacion.cancionesSinAudio ? (
                      <li>
                        {informeImportacion.cancionesSinAudio} canciones del respaldo sin audio en
                        disco (omitidas)
                      </li>
                    ) : null}
                  </ul>
                  <button
                    className="panel-boton"
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw aria-hidden="true" />
                    Recargar el panel
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="panel-config-nota">
              El respaldo completo y la importación los maneja el dueño desde su
              sesión.
            </p>
          )}
        </div>
      </section>

      <section className="panel-tarjeta" aria-label="Enlaces del festival">
        <h2 className="panel-tarjeta-titulo">
          <ExternalLink aria-hidden="true" />
          Enlaces del festival
        </h2>
        <ul className="panel-config-enlaces">
          <li>
            <span>Instagram</span>
            <a href={FESTIVAL.instagram} target="_blank" rel="noopener">
              {FESTIVAL.instagramArroba}
              <ExternalLink aria-hidden="true" />
            </a>
          </li>
          <li>
            <span>TikTok</span>
            <a href={FESTIVAL.tiktok} target="_blank" rel="noopener">
              {FESTIVAL.tiktokArroba}
              <ExternalLink aria-hidden="true" />
            </a>
          </li>
          <li>
            <span>Boletos</span>
            <a href={FESTIVAL.passlineUrl} target="_blank" rel="noopener">
              Passline · {FESTIVAL.fase}
              <ExternalLink aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>

      <section className="panel-tarjeta" aria-label="Redes sociales de la radio">
        <h2 className="panel-tarjeta-titulo">
          <Share2 aria-hidden="true" />
          Redes sociales de la radio
        </h2>
        <p className="panel-tarjeta-sub">
          Aparecen como iconos arriba del reproductor y como filas en Sobre
          Chiripa. Vacío deja las cuentas de siempre (@chiiiripa).
        </p>

        {esDueno ? (
          <div className="panel-redes">
            {redesCargadas ? (
              <>
                {redes.map((red, i) => (
                  <div key={i} className="panel-red-fila">
                    <div className="panel-red-campos">
                      <input
                        type="text"
                        value={red.nombre}
                        placeholder="Nombre (Instagram, Web…)"
                        aria-label={`Nombre de la red ${i + 1}`}
                        maxLength={40}
                        onChange={(e) => cambiarRed(i, { nombre: e.target.value })}
                      />
                      <input
                        type="url"
                        value={red.url}
                        placeholder="https://…"
                        aria-label={`Enlace de la red ${i + 1}`}
                        onChange={(e) => cambiarRed(i, { url: e.target.value })}
                      />
                      <select
                        value={red.icono}
                        aria-label={`Icono de la red ${i + 1}`}
                        onChange={(e) =>
                          cambiarRed(i, { icono: e.target.value })
                        }
                      >
                        {ICONOS_RED.map((icono) => (
                          <option key={icono} value={icono}>
                            {icono}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="panel-icono panel-icono-peligro"
                      type="button"
                      aria-label={`Quitar ${red.nombre}`}
                      title="Quitar"
                      onClick={() => {
                        setRedes((lista) => lista.filter((_, j) => j !== i));
                        setAvisoRedes(null);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <div className="panel-red-acciones">
                  <button
                    className="panel-boton"
                    type="button"
                    disabled={redes.length >= 8}
                    onClick={() =>
                      setRedes((lista) => [
                        ...lista,
                        { nombre: "", url: "", icono: "web" },
                      ])
                    }
                  >
                    <Plus aria-hidden="true" />
                    Agregar red
                  </button>
                  <button
                    className="panel-boton panel-boton-primario"
                    type="button"
                    disabled={guardandoRedes}
                    onClick={() => void guardarRedes()}
                  >
                    <Check aria-hidden="true" />
                    {guardandoRedes ? "Guardando…" : "Guardar redes"}
                  </button>
                </div>
                {avisoRedes ? (
                  <p
                    className={`panel-config-aviso${avisoRedes.tipo === "error" ? " panel-config-aviso-error" : ""}`}
                  >
                    {avisoRedes.texto}
                  </p>
                ) : (
                  <p className="panel-config-nota">
                    Hasta 8 enlaces. El icono se elige solo según el dominio
                    (Instagram, TikTok, X, YouTube, Facebook o web) y puedes
                    cambiarlo a mano. Filas sin nombre o con URL inválida no se
                    guardan.
                  </p>
                )}
              </>
            ) : (
              <p className="panel-espera-linea">Cargando las redes…</p>
            )}
          </div>
        ) : (
          <p className="panel-config-nota">
            Las redes las configura el dueño desde su sesión.
          </p>
        )}
      </section>

      <section className="panel-tarjeta" aria-label="Acerca de">
        <h2 className="panel-tarjeta-titulo">
          <Info aria-hidden="true" />
          Acerca de
        </h2>
        <div className="panel-config-acerca">
          <p>
            <strong>Panel de Chiripa Radio</strong>
            <span className="panel-pill panel-pill-acento">
              v{config?.version ?? "…"}
            </span>
          </p>
          <p className="panel-config-nota">
            {FESTIVAL.titulo} · {FESTIVAL.fechas} · {FESTIVAL.lugar}, {FESTIVAL.ciudad}
          </p>
          <a className="panel-boton" href="/" target="_blank" rel="noopener">
            <Radio aria-hidden="true" />
            Ver la radio pública
          </a>
        </div>
      </section>
    </div>
  );
}
