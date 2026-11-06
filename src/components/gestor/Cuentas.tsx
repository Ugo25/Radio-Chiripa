"use client";

import { useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { pedirGestor } from "./api";
import { haceCuanto, iniciales, type CuentaPanel } from "./tipos";

type FormaCuenta = {
  nombre: string;
  correo: string;
  usuario: string;
  contrasena: string;
  rol: "dueno" | "colaborador";
  foto?: string;
  activo: boolean;
};

const FORMA_VACIA: FormaCuenta = {
  nombre: "",
  correo: "",
  usuario: "",
  contrasena: "",
  rol: "colaborador",
  activo: true,
};

export function Cuentas({
  cuentas,
  onRefrescar,
  onDesconexion,
}: {
  cuentas: CuentaPanel[];
  onRefrescar: () => void;
  onDesconexion: () => void;
}) {
  const [forma, setForma] = useState<FormaCuenta>(FORMA_VACIA);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mostrandoForma, setMostrandoForma] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);

  const abrirCreacion = () => {
    setForma(FORMA_VACIA);
    setEditandoId(null);
    setMostrandoForma(true);
    setError("");
  };

  const abrirEdicion = (cuenta: CuentaPanel) => {
    setForma({
      nombre: cuenta.nombre,
      correo: cuenta.correo ?? "",
      usuario: cuenta.usuario ?? "",
      contrasena: "",
      rol: cuenta.rol,
      foto: cuenta.foto,
      activo: cuenta.activo,
    });
    setEditandoId(cuenta.id);
    setMostrandoForma(true);
    setError("");
  };

  const cerrarForma = () => {
    setMostrandoForma(false);
    setEditandoId(null);
    setForma(FORMA_VACIA);
    setError("");
  };

  const subirFoto = async (archivo: File) => {
    setSubiendoFoto(true);
    setError("");
    const datos = new FormData();
    datos.append("foto", archivo);
    const res = await pedirGestor("/api/biblioteca/cuentas/foto", {
      method: "POST",
      body: datos,
    });
    setSubiendoFoto(false);
    if (!res) {
      onDesconexion();
      return;
    }
    const data = (await res.json().catch(() => null)) as { foto?: string; error?: string } | null;
    if (!res.ok || !data?.foto) {
      setError(data?.error ?? "No se pudo subir la foto.");
      return;
    }
    setForma((f) => ({ ...f, foto: data.foto }));
  };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setError("");

    const cuerpo = editandoId
      ? {
          id: editandoId,
          nombre: forma.nombre,
          correo: forma.correo,
          usuario: forma.usuario,
          rol: forma.rol,
          foto: forma.foto ?? "",
          activo: forma.activo,
          ...(forma.contrasena ? { contrasena: forma.contrasena } : {}),
        }
      : {
          nombre: forma.nombre,
          correo: forma.correo,
          usuario: forma.usuario,
          contrasena: forma.contrasena,
          rol: forma.rol,
          foto: forma.foto,
        };

    const res = await pedirGestor("/api/biblioteca/cuentas", {
      method: editandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    setGuardando(false);
    if (!res) {
      onDesconexion();
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "No se pudo guardar la cuenta.");
      return;
    }
    cerrarForma();
    onRefrescar();
  };

  const alternarActiva = async (cuenta: CuentaPanel) => {
    const res = await pedirGestor("/api/biblioteca/cuentas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cuenta.id, activo: !cuenta.activo }),
    });
    if (!res) {
      onDesconexion();
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "No se pudo cambiar el estado.");
      return;
    }
    onRefrescar();
  };

  const borrar = async (id: string) => {
    const res = await pedirGestor(`/api/biblioteca/cuentas?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setConfirmarBorrado(null);
    if (!res) {
      onDesconexion();
      return;
    }
    onRefrescar();
  };

  const avatar = (cuenta: { foto?: string; nombre: string }, tamano: number) =>
    cuenta.foto ? (
      <img
        className="panel-cuenta-foto"
        src={cuenta.foto}
        alt={`Foto de ${cuenta.nombre}`}
        width={tamano}
        height={tamano}
      />
    ) : (
      <span
        className="panel-cuenta-foto panel-cuenta-foto-iniciales"
        style={{ width: tamano, height: tamano }}
        aria-hidden="true"
      >
        {iniciales(cuenta.nombre)}
      </span>
    );

  return (
    <div className="panel-cuentas">
      <section className="panel-tarjeta panel-cuentas-cabecera">
        <div>
          <h2 className="panel-tarjeta-titulo">
            <UserRound aria-hidden="true" />
            Cuentas del panel ({cuentas.length})
          </h2>
          <p className="panel-tarjeta-sub">
            Cada cuenta entra con su correo o usuario y su contraseña. Las
            contraseñas viven cifradas (scrypt) dentro del proyecto: nada en
            servicios de terceros.
          </p>
        </div>
        {!mostrandoForma ? (
          <button className="panel-boton panel-boton-primario" type="button" onClick={abrirCreacion}>
            <Plus aria-hidden="true" />
            Nueva cuenta
          </button>
        ) : null}
      </section>

      {mostrandoForma ? (
        <section className="panel-tarjeta panel-cuenta-forma" aria-label={editandoId ? "Editar cuenta" : "Nueva cuenta"}>
          <h3 className="panel-tarjeta-titulo">
            {editandoId ? "Editar cuenta" : "Nueva cuenta"}
          </h3>

          <div className="panel-cuenta-forma-cuerpo">
            <div className="panel-cuenta-foto-caja">
              {avatar({ foto: forma.foto, nombre: forma.nombre || "?" }, 84)}
              <div>
                <input
                  ref={entradaFoto}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="panel-entrada-oculta"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0];
                    if (archivo) void subirFoto(archivo);
                    e.target.value = "";
                  }}
                />
                <button
                  className="panel-boton"
                  type="button"
                  onClick={() => entradaFoto.current?.click()}
                  disabled={subiendoFoto}
                >
                  {subiendoFoto ? (
                    <Loader2 className="panel-girando" aria-hidden="true" />
                  ) : (
                    <Camera aria-hidden="true" />
                  )}
                  {forma.foto ? "Cambiar foto" : "Subir foto"}
                </button>
                {forma.foto ? (
                  <button
                    className="panel-boton panel-boton-fantasma"
                    type="button"
                    onClick={() => setForma((f) => ({ ...f, foto: undefined }))}
                  >
                    Quitar
                  </button>
                ) : null}
                <p className="panel-campo-ayuda">JPG, PNG o WebP — hasta 5 MB.</p>
              </div>
            </div>

            <div className="panel-campos">
              <div className="panel-campo">
                <label htmlFor="cuenta-nombre">Nombre</label>
                <input
                  id="cuenta-nombre"
                  value={forma.nombre}
                  onChange={(e) => setForma((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Cómo se llama"
                />
              </div>

              <div className="panel-campo">
                <label htmlFor="cuenta-correo">Correo</label>
                <input
                  id="cuenta-correo"
                  type="email"
                  value={forma.correo}
                  onChange={(e) => setForma((f) => ({ ...f, correo: e.target.value }))}
                  placeholder="tucorreo@ejemplo.com"
                  autoComplete="off"
                />
              </div>

              <div className="panel-campo">
                <label htmlFor="cuenta-usuario">
                  Usuario <span className="panel-campo-nota">(opcional)</span>
                </label>
                <input
                  id="cuenta-usuario"
                  value={forma.usuario}
                  onChange={(e) => setForma((f) => ({ ...f, usuario: e.target.value }))}
                  placeholder="un.apodo"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p className="panel-campo-ayuda">
                  Letras, números, punto, guion y guion bajo (3 a 40). Sirve para
                  entrar en vez del correo.
                </p>
              </div>

              <div className="panel-campo">
                <label htmlFor="cuenta-contrasena">
                  {editandoId ? "Contraseña nueva " : "Contraseña "}
                  {editandoId ? <span className="panel-campo-nota">(déjala vacía para conservar)</span> : null}
                </label>
                <input
                  id="cuenta-contrasena"
                  type="password"
                  value={forma.contrasena}
                  onChange={(e) => setForma((f) => ({ ...f, contrasena: e.target.value }))}
                  placeholder={editandoId ? "••••••••" : "Mínimo 6 caracteres"}
                  autoComplete="new-password"
                />
              </div>

              <div className="panel-campo">
                <label htmlFor="cuenta-rol">Rol</label>
                <select
                  id="cuenta-rol"
                  value={forma.rol}
                  onChange={(e) =>
                    setForma((f) => ({ ...f, rol: e.target.value as FormaCuenta["rol"] }))
                  }
                >
                  <option value="colaborador">Colaborador — biblioteca, álbumes y letras</option>
                  <option value="dueno">Dueño — todo, incluidas las cuentas</option>
                </select>
              </div>

              {editandoId ? (
                <div className="panel-campo panel-campo-check">
                  <label htmlFor="cuenta-activa">
                    <input
                      id="cuenta-activa"
                      type="checkbox"
                      checked={forma.activo}
                      onChange={(e) => setForma((f) => ({ ...f, activo: e.target.checked }))}
                    />
                    Cuenta activa (desmarcar cierra su sesión al instante)
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="panel-aviso-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="panel-edicion-acciones">
            <button
              className="panel-boton panel-boton-primario"
              type="button"
              onClick={() => void guardar()}
              disabled={guardando || !forma.nombre.trim()}
            >
              {guardando ? (
                <Loader2 className="panel-girando" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {editandoId ? "Guardar cambios" : "Crear cuenta"}
            </button>
            <button className="panel-boton" type="button" onClick={cerrarForma}>
              <X aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {cuentas.length ? (
        <ul className="panel-cuentas-lista">
          {cuentas.map((cuenta) => (
            <li key={cuenta.id} className={`panel-cuenta${cuenta.activo ? "" : " panel-cuenta-inactiva"}`}>
              {avatar(cuenta, 48)}
              <div className="panel-cuenta-datos">
                <p className="panel-cuenta-nombre">
                  {cuenta.nombre}
                  <span
                    className={`panel-pill ${cuenta.rol === "dueno" ? "panel-pill-acento" : "panel-pill-gris"}`}
                  >
                    <ShieldCheck aria-hidden="true" />
                    {cuenta.rol === "dueno" ? "Dueño" : "Colaborador"}
                  </span>
                  {!cuenta.activo ? (
                    <span className="panel-pill panel-pill-roja">Desactivada</span>
                  ) : null}
                </p>
                <p className="panel-cuenta-meta">
                  {[cuenta.correo, cuenta.usuario].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="panel-cuenta-sub">
                  Entró {haceCuanto(cuenta.ultimaEntradaISO)} · creada{" "}
                  {haceCuanto(cuenta.creadoISO)}
                </p>
              </div>
              <div className="panel-cancion-acciones">
                <button
                  className="panel-icono"
                  type="button"
                  onClick={() => abrirEdicion(cuenta)}
                  aria-label={`Editar la cuenta de ${cuenta.nombre}`}
                >
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  className={`panel-icono${cuenta.activo ? " panel-icono-activo" : ""}`}
                  type="button"
                  onClick={() => void alternarActiva(cuenta)}
                  aria-pressed={cuenta.activo}
                  aria-label={
                    cuenta.activo
                      ? `Desactivar la cuenta de ${cuenta.nombre}`
                      : `Activar la cuenta de ${cuenta.nombre}`
                  }
                  title={cuenta.activo ? "Desactivar (cierra su sesión)" : "Activar"}
                >
                  <Check aria-hidden="true" />
                </button>
                {confirmarBorrado === cuenta.id ? (
                  <span className="panel-confirmar">
                    ¿Borrar?
                    <button
                      className="panel-boton panel-boton-peligro"
                      type="button"
                      onClick={() => void borrar(cuenta.id)}
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
                    onClick={() => setConfirmarBorrado(cuenta.id)}
                    aria-label={`Borrar la cuenta de ${cuenta.nombre}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : !mostrandoForma ? (
        <p className="panel-vacio">
          <UserRound aria-hidden="true" />
          Todavía no hay cuentas: crea la primera para que alguien más entre
          al panel sin el PIN.
        </p>
      ) : null}
    </div>
  );
}
