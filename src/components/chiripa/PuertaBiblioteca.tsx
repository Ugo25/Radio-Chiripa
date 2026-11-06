"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { guardarToken } from "@/lib/llave-cliente";
import {
  ArrowLeft,
  AtSign,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LibraryBig,
  Loader2,
  LockKeyhole,
  UserRound,
} from "lucide-react";

type PropsPuerta = {
  titulo: string;
  subtitulo: string;
  alEntrar: () => void | Promise<void>;
};

const CONFIRMACION_MS = 500;

export function PuertaEspera({ texto = "Abriendo la puerta…" }: { texto?: string }) {
  return (
    <main className="carga">
      <div className="carga-fondo" aria-hidden="true" />
      <div className="carga-pastilla" role="status">
        <Loader2 className="puerta-girando" aria-hidden="true" />
        <p>{texto}</p>
      </div>
    </main>
  );
}

export function PuertaBiblioteca({ titulo, subtitulo, alEntrar }: PropsPuerta) {
  const [modo, setModo] = useState<"pin" | "cuenta">("pin");

  const [pin, setPin] = useState("");
  const [verPin, setVerPin] = useState(false);

  const [identidad, setIdentidad] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);

  const [entrando, setEntrando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");

  const campoRef = useRef<HTMLDivElement | null>(null);
  const entradaRef = useRef<HTMLInputElement | null>(null);

  // El chrome del móvil (barra de direcciones) también se pone negro
  // mientras la puerta está abierta; al salir vuelve el color del sitio.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const previo = meta?.getAttribute("content") ?? null;
    if (meta) meta.setAttribute("content", "#09090b");
    return () => {
      if (meta && previo) meta.setAttribute("content", previo);
    };
  }, []);

  useEffect(() => {
    entradaRef.current?.focus();
  }, [modo]);

  const sacudir = () => {
    campoRef.current?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-7px)" },
        { transform: "translateX(7px)" },
        { transform: "translateX(-5px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 420, easing: "ease-in-out" },
    );
  };

  const entrar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (entrando || listo) return;
    if (modo === "pin" && !pin) return;
    if (modo === "cuenta" && (!identidad || !contrasena)) return;
    setEntrando(true);
    setError("");
    try {
      const res = await fetch("/api/biblioteca/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modo === "pin" ? { pin } : { identidad, contrasena },
        ),
      });
      if (res.ok) {
        try {
          const data = (await res.json()) as { token?: string };
          if (data.token) guardarToken(data.token);
        } catch {
          // La cookie sigue siendo la llave principal.
        }
        setListo(true);
        await new Promise((r) => setTimeout(r, CONFIRMACION_MS));
        await alEntrar();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        data?.error ??
          (modo === "pin" ? "PIN incorrecto." : "Cuenta o contraseña incorrecta."),
      );
      sacudir();
      entradaRef.current?.focus();
      entradaRef.current?.select();
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu internet.");
      sacudir();
    } finally {
      setEntrando(false);
    }
  };

  const cambiarModo = (nuevo: "pin" | "cuenta") => {
    if (entrando || listo) return;
    setModo(nuevo);
    setError("");
  };

  return (
    <main className="puerta">
      <div className="puerta-fondo" aria-hidden="true">
        <div className="puerta-fondo-capa" />
      </div>

      <header className="puerta-marca">
        <img
          className="puerta-logo"
          src="/chiripa-logo.jpg"
          alt=""
          width={96}
          height={96}
        />
        <h1 className="puerta-wordmark">
          <span className="puerta-inicial">C</span>hiripa
        </h1>
        <p className="puerta-marca-linea">Panel de control</p>
      </header>

      <section className="puerta-tarjeta" aria-labelledby="puerta-titulo">
        <header className="puerta-encabezado">
          <div className="puerta-candado" aria-hidden="true">
            <LockKeyhole />
          </div>
          <div>
            <h2 className="puerta-titulo" id="puerta-titulo">
              {titulo}
            </h2>
            <p className="puerta-sub">{subtitulo}</p>
          </div>
        </header>

        <div className="puerta-tabs" role="tablist" aria-label="Manera de entrar">
          <button
            type="button"
            role="tab"
            aria-selected={modo === "pin"}
            className={modo === "pin" ? "puerta-tab puerta-tab-activa" : "puerta-tab"}
            onClick={() => cambiarModo("pin")}
          >
            <KeyRound aria-hidden="true" />
            PIN del dueño
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === "cuenta"}
            className={
              modo === "cuenta" ? "puerta-tab puerta-tab-activa" : "puerta-tab"
            }
            onClick={() => cambiarModo("cuenta")}
          >
            <UserRound aria-hidden="true" />
            Mi cuenta
          </button>
        </div>

        <form className="puerta-forma" onSubmit={entrar}>
          {modo === "pin" ? (
            <>
              <label className="puerta-etiqueta" htmlFor="puerta-pin">
                PIN de acceso
              </label>
              <div
                className={`puerta-campo${error ? " puerta-campo-error" : ""}`}
                ref={campoRef}
              >
                <KeyRound className="puerta-campo-icono" aria-hidden="true" />
                <input
                  id="puerta-pin"
                  className="puerta-pin"
                  ref={entradaRef}
                  type={verPin ? "text" : "password"}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    if (error) setError("");
                  }}
                  aria-describedby={error ? "puerta-error" : undefined}
                  disabled={listo}
                />
                <button
                  type="button"
                  className="puerta-ojo"
                  onClick={() => setVerPin((v) => !v)}
                  aria-label={verPin ? "Ocultar el PIN" : "Mostrar el PIN"}
                  aria-pressed={verPin}
                  disabled={listo}
                >
                  {verPin ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="puerta-etiqueta" htmlFor="puerta-identidad">
                Correo o usuario
              </label>
              <div
                className={`puerta-campo${error ? " puerta-campo-error" : ""}`}
                ref={campoRef}
              >
                <AtSign className="puerta-campo-icono" aria-hidden="true" />
                <input
                  id="puerta-identidad"
                  ref={entradaRef}
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="tucorreo@ejemplo.com"
                  value={identidad}
                  onChange={(e) => {
                    setIdentidad(e.target.value);
                    if (error) setError("");
                  }}
                  aria-describedby={error ? "puerta-error" : undefined}
                  disabled={listo}
                />
              </div>

              <label className="puerta-etiqueta" htmlFor="puerta-contrasena">
                Contraseña
              </label>
              <div
                className={`puerta-campo${error ? " puerta-campo-error" : ""}`}
              >
                <LockKeyhole className="puerta-campo-icono" aria-hidden="true" />
                <input
                  id="puerta-contrasena"
                  type={verContrasena ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  value={contrasena}
                  onChange={(e) => {
                    setContrasena(e.target.value);
                    if (error) setError("");
                  }}
                  aria-describedby={error ? "puerta-error" : undefined}
                  disabled={listo}
                />
                <button
                  type="button"
                  className="puerta-ojo"
                  onClick={() => setVerContrasena((v) => !v)}
                  aria-label={
                    verContrasena ? "Ocultar la contraseña" : "Mostrar la contraseña"
                  }
                  aria-pressed={verContrasena}
                  disabled={listo}
                >
                  {verContrasena ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </button>
              </div>
            </>
          )}

          <button
            className="puerta-boton"
            type="submit"
            disabled={
              entrando ||
              listo ||
              (modo === "pin" ? !pin : !identidad || !contrasena)
            }
          >
            {entrando || listo ? (
              <Loader2 className="puerta-girando" aria-hidden="true" />
            ) : (
              <LibraryBig aria-hidden="true" />
            )}
            {listo ? "Abriendo…" : entrando ? "Verificando…" : "Entrar al panel"}
          </button>

          {error ? (
            <p className="puerta-error" role="alert" id="puerta-error">
              <CircleAlert aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {listo ? (
            <p className="puerta-exito" role="status">
              <CheckCircle2 aria-hidden="true" />
              ¡Correcto! Abriendo el panel…
            </p>
          ) : null}
        </form>
      </section>

      <Link className="puerta-volver" href="/">
        <ArrowLeft aria-hidden="true" />
        Volver a la radio
      </Link>
      <p className="puerta-nota">
        Al entrar, el panel queda abierto en este dispositivo durante 30 días.
      </p>
    </main>
  );
}
