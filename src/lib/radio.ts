"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const RADIO_CONFIG: {
  apiBase: string;
  oyentesCadaMs: number;
  sinDatosMs: number;
  maximoMs: number;
  letraFueraMs: number;
} = {
  apiBase: "/api/radio",

  oyentesCadaMs: 20_000,
  sinDatosMs: 30_000,
  maximoMs: 5 * 60_000,
  letraFueraMs: 6_000,
};

export const PORTADA_PLACEHOLDER = "/chiripa-logo.jpg";

export type Cancion = {
  id: string;
  titulo: string;
  artista: string;
  album?: string;
  portada?: string;
  duracionSeg?: number;
  empezoISO?: string;
  audioUrl?: string;
  letra?: string[];
  origen?: "biblioteca";
  siguienteId?: string;
  siguienteUrl?: string;
};

export const TEXTOS = {
  sinCancionTitulo: "Radio Chiripa",
  sinCancionArtista: "Encendiendo la señal…",
  senalNoDisponible: "Señal no disponible en este momento; vuelve en cuanto se restablezca.",
  graciasTitulo: "Gracias por escuchar",
  silencioNocturno: "Silencio nocturno programado",
  silencioNocturnoAviso: "La radio vuelve en cuanto termine el descanso.",
  letraEsperando:
    "Aquí verás la letra de la canción sonando: se enciende junto con la señal.",
  letraCargando: "Cargando la letra…",
  letraNoDisponible: "Letra no disponible para esta canción.",
  letraInstrumental: "Instrumental — esta canción no tiene letra, solo música.",

  esperaPrimerToque: "Toca ▶ y la radio suena al minuto en vivo.",
  senalFuera: "La señal no está al aire en este momento.",
  falloRed: "No se pudo conectar con la señal: revisa tu conexión.",
  falloReproductor:
    "El reproductor no pudo cargar. Revisa tu conexión o intenta de nuevo.",
} as const;

export type Silencio = {
  motivo: "emergencia" | "nocturno";
  reanudacionISO?: string;
  titulo?: string;
  detalle?: string;
  mensaje?: string;
};

/** Lo que devuelve el consultar la señal: una canción, un silencio activo o nada. */
type EstadoSenal =
  | { tipo: "cancion"; cancion: Cancion }
  | ({ tipo: "silencio" } & Silencio)
  | { tipo: "apagada" };

export function formatearTiempo(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatearRestante(seg: number): string {
  return `−${formatearTiempo(Math.max(0, seg))}`;
}

export const apiConectada = () => RADIO_CONFIG.apiBase !== "";

function idCliente(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem("chiripa-cliente");
    if (!id) {
      id =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("chiripa-cliente", id);
    }
    return id;
  } catch {
    return "";
  }
}

/** Solo cadenas con contenido; lo demás no existe. */
function cadena(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

async function pedirSenal(): Promise<EstadoSenal> {
  try {
    const res = await fetch(`${RADIO_CONFIG.apiBase}/now-playing`, {
      cache: "no-store",
    });
    // El cuerpo trae el motivo aunque la respuesta venga con 503: se lee igual.
    const data = (await res.json().catch(() => null)) as
      | (Record<string, unknown> & {
          silenciada?: boolean;
        })
      | null;
    if (data && data.silenciada === true) {
      return {
        tipo: "silencio",
        motivo: data.motivo === "nocturno" ? "nocturno" : "emergencia",
        reanudacionISO: cadena(data.reanudacionISO),
        titulo: cadena(data.titulo),
        detalle: cadena(data.detalle),
        mensaje: cadena(data.mensaje),
      };
    }
    if (!res.ok || !data || !data.titulo) return { tipo: "apagada" };
    const siguiente = data.siguiente as
      | { id?: unknown; audioUrl?: unknown }
      | undefined;
    return {
      tipo: "cancion",
      cancion: {
        id: String(data.id ?? data.titulo),
        titulo: String(data.titulo),
        artista: data.artista
          ? String(data.artista)
              .split(",")
              .map((a: string) => a.trim())
              .filter(Boolean)
              .join(", ")
          : "",
        album: cadena(data.album),
        portada: cadena(data.portada) ?? cadena(data.cover),
        duracionSeg:
          typeof data.duracionSeg === "number"
            ? data.duracionSeg
            : typeof data.duration_sec === "number"
              ? data.duration_sec
              : undefined,
        empezoISO: cadena(data.empezoISO) ?? cadena(data.started_at),
        audioUrl: cadena(data.audioUrl),
        letra: Array.isArray(data.letra) ? (data.letra as string[]) : undefined,
        origen: "biblioteca",
        siguienteId: cadena(siguiente?.id),
        siguienteUrl: cadena(siguiente?.audioUrl),
      },
    };
  } catch {
    /* Sin red no se sabe nada de la señal: la que suena, sigue sonando. */
    return { tipo: "apagada" };
  }
}

async function obtenerOyentes(): Promise<number | null> {
  try {
    const res = await fetch(`${RADIO_CONFIG.apiBase}/listeners`, {
      cache: "no-store",
      headers: idCliente() ? { "X-Cliente-Id": idCliente() } : undefined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const valor =
      typeof data.espectadores === "number"
        ? data.espectadores
        : typeof data.listeners === "number"
          ? data.listeners
          : typeof data.oyentes === "number"
            ? data.oyentes
            : null;
    return valor;
  } catch {
    return null;
  }
}

const cacheLetras = new Map<string, Promise<{ lineas: string[] | null; instrumental: boolean }>>();

/* Las letras pegadas a mano deben verse al instante: cuando letras.json
   cambia, el centinela invalida la caché y avisa a las pantallas abiertas. */
let versionLetras = 0;
const oyentesLetras = new Set<(version: number) => void>();

function invalidarLetras(): void {
  cacheLetras.clear();
  versionLetras += 1;
  for (const oyente of oyentesLetras) oyente(versionLetras);
}

function pedirLetra(
  id: string,
): Promise<{ lineas: string[] | null; instrumental: boolean }> {
  if (!apiConectada()) return Promise.resolve({ lineas: null, instrumental: false });
  let promesa = cacheLetras.get(id);
  if (!promesa) {
    const ctrl = new AbortController();
    const fuera = setTimeout(() => ctrl.abort(), RADIO_CONFIG.letraFueraMs);
    promesa = fetch(
      `${RADIO_CONFIG.apiBase}/tracks/${encodeURIComponent(id)}/lyrics`,
      { signal: ctrl.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          json: { lyrics?: unknown; instrumental?: unknown } | null,
        ): { lineas: string[] | null; instrumental: boolean } => {
          if (json?.instrumental === true) return { lineas: null, instrumental: true };
          return {
            lineas:
              json && typeof json.lyrics === "string" && json.lyrics.trim()
                ? json.lyrics.split(/\r?\n/)
                : null,
            instrumental: false,
          };
        },
      )
      .catch(() => {
        cacheLetras.delete(id);
        return { lineas: null, instrumental: false };
      })
      .finally(() => clearTimeout(fuera));
    cacheLetras.set(id, promesa);
  }
  return promesa;
}

export function useRadio() {
  const conectada = apiConectada();
  const [cancion, setCancion] = useState<Cancion | null>(null);
  const [sonando, setSonando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [silencio, setSilencio] = useState<Silencio | null>(null);

  const sonandoRef = useRef(false);
  const pausaDeseadaRef = useRef(false);
  const pistaCargadaRef = useRef("");
  const viviendoRef = useRef(false);
  const vivirRef = useRef<() => void>(() => {});
  /* El centinela de cambios (letras, silencios, biblioteca) llama esto para
     que la señal se consulte ya, sin esperar el latido programado. */
  const despertarRef = useRef<() => void>(() => {});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cortadaPorSilencioRef = useRef(false);

  /* La radio es en vivo: la posición sale del reloj y todo salto externo
     se devuelve al minuto al aire. */
  const empezoMsRef = useRef<number | null>(null);
  const duracionRef = useRef(0);
  const saltoInternoRef = useRef(0);

  const posicionViva = useCallback((): number | null => {
    if (empezoMsRef.current === null) return null;
    const objetivo = (Date.now() - empezoMsRef.current) / 1000;
    const tope =
      duracionRef.current > 0
        ? duracionRef.current - 1
        : Number.MAX_SAFE_INTEGER;
    return Math.max(0, Math.min(objetivo, tope));
  }, []);

  const fijarPista = useCallback(
    (empezoISO: string | undefined, duracionSeg: number | undefined) => {
      empezoMsRef.current = empezoISO ? Date.parse(empezoISO) : null;
      duracionRef.current =
        typeof duracionSeg === "number" && duracionSeg > 0 ? duracionSeg : 0;
    },
    [],
  );

  const moverA = useCallback((el: HTMLAudioElement, segundo: number) => {
    saltoInternoRef.current = Date.now();
    try {
      el.currentTime = segundo;
    } catch {
      /* aún sin metadatos: el navegador encuadra al cargar */
    }
  }, []);

  /* Los eventos solo cuentan si vienen del elemento vivo: al cambiar de
     canción se retiraba el viejo y no debe seguir mandando en la UI. */
  const conectarEventos = useCallback(
    (el: HTMLAudioElement) => {
      el.addEventListener("play", () => {
        if (audioRef.current !== el) return;
        pausaDeseadaRef.current = false;
        cortadaPorSilencioRef.current = false;
        if (!sonandoRef.current) {
          sonandoRef.current = true;
          setSonando(true);
        }
        setAviso("");
      });
      el.addEventListener("pause", () => {
        if (audioRef.current !== el) return;
        if (sonandoRef.current) {
          sonandoRef.current = false;
          setSonando(false);
        }
      });
      el.addEventListener("ended", () => {
        if (audioRef.current !== el) return;
        sonandoRef.current = false;
        setSonando(false);
        vivirRef.current();
      });
      // Un salto externo (notificación, pantalla de bloqueo) devuelve al minuto
      // en vivo; los internos van por moverA y quedan fuera del freno.
      el.addEventListener("seeking", () => {
        if (audioRef.current !== el) return;
        if (Date.now() - saltoInternoRef.current < 500) return;
        const vivo = posicionViva();
        if (vivo === null) return;
        if (Math.abs(el.currentTime - vivo) > 2.5) moverA(el, vivo);
      });
    },
    [moverA, posicionViva],
  );

  const obtenerAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = "auto";
      conectarEventos(el);
      audioRef.current = el;
      // Controles del sistema (Android/iOS): la radio no permite saltos.
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        const acciones: MediaSessionAction[] = [
          "seekbackward",
          "seekforward",
          "seekto",
          "previoustrack",
          "nexttrack",
        ];
        for (const accion of acciones) {
          try {
            navigator.mediaSession.setActionHandler(accion, () => {});
          } catch {
            /* el navegador no trae esa acción */
          }
        }
      }
    }
    return audioRef.current;
  }, [conectarEventos]);

  /* Precarga de la siguiente canción: mientras la actual termina, el
     navegador ya trajo metadatos y buffer de la que sigue, así el cambio
     suena al segundo y no parece que la radio se cayó. */
  const precargaRef = useRef<{ id: string; el: HTMLAudioElement } | null>(null);

  const soltarElemento = useCallback((el: HTMLAudioElement) => {
    try {
      el.pause();
      el.removeAttribute("src");
      el.load();
    } catch {
      /* nada que soltar */
    }
  }, []);

  const precargar = useCallback(
    (id: string, url: string) => {
      if (!id || !url) return;
      if (precargaRef.current?.id === id) return;
      if (id === pistaCargadaRef.current) return;
      const previa = precargaRef.current;
      if (previa) soltarElemento(previa.el);
      const el = new Audio();
      el.preload = "auto";
      conectarEventos(el);
      el.src = url;
      precargaRef.current = { id, el };
    },
    [conectarEventos, soltarElemento],
  );

  /* Silencio de la señal: el audio de este oyente se corta y la tarjeta
     muestra la cara de descanso que toque (nocturno saluda, emergencia
     avisa señal no disponible). */
  const cortarPorSilencio = useCallback((estado: Silencio) => {
    setSilencio(estado);
    setCancion(null);
    setAviso(
      estado.mensaje ??
        (estado.motivo === "nocturno"
          ? TEXTOS.silencioNocturnoAviso
          : TEXTOS.senalNoDisponible),
    );
    const el = audioRef.current;
    if (el) {
      // Si el oyente no pausó por su cuenta, la escucha vuelve con la señal.
      cortadaPorSilencioRef.current = true;
      if (!el.paused) el.pause();
    }
  }, []);

  const sonarBiblioteca = useCallback(
    async (url: string, segundo: number, id = "") => {
      const el = obtenerAudio();
      const precargada = precargaRef.current;

      // Camino rápido: la siguiente ya venía cargándose en su propio elemento.
      if (
        id &&
        precargada &&
        precargada.id === id &&
        precargada.el.src &&
        precargada.el.src.includes(url) &&
        precargada.el.readyState >= 1
      ) {
        precargaRef.current = null;
        const viejo = el;
        audioRef.current = precargada.el;
        if (viejo !== precargada.el) {
          viejo.pause();
          soltarElemento(viejo);
        }
        moverA(precargada.el, segundo);
        try {
          await precargada.el.play();
        } catch {
          setAviso(TEXTOS.falloReproductor);
        }
        return;
      }

      if (precargada && precargada.id !== id) {
        soltarElemento(precargada.el);
        precargaRef.current = null;
      }
      if (!el.src || !el.src.includes(url)) {
        el.src = url;
        if (el.readyState < 1) {
          await Promise.race([
            new Promise<void>((r) =>
              el.addEventListener("loadedmetadata", () => r(), { once: true }),
            ),
            new Promise<void>((r) => setTimeout(r, 2500)),
          ]);
        }
      }
      moverA(el, segundo);
      try {
        await el.play();
      } catch {
        setAviso(TEXTOS.falloReproductor);
      }
    },
    [obtenerAudio, moverA, soltarElemento],
  );

  const vivir = useCallback(async () => {
    if (viviendoRef.current) return;
    viviendoRef.current = true;
    setIniciando(true);
    try {
      const resultado = await pedirSenal();
      if (resultado.tipo === "silencio") {
        cortarPorSilencio(resultado);
        return;
      }
      const alAire = resultado.tipo === "cancion" ? resultado.cancion : null;
      if (!alAire?.audioUrl) {
        setSilencio(null);
        setAviso(TEXTOS.senalFuera);
        return;
      }
      setSilencio(null);
      const objetivoMs = alAire.empezoISO
        ? Date.now() - new Date(alAire.empezoISO).getTime()
        : 0;
      const duracion = alAire.duracionSeg ?? 0;
      const segundoVivo = Math.max(
        0,
        Math.min(objetivoMs / 1000, duracion > 0 ? duracion - 3 : Number.MAX_SAFE_INTEGER),
      );

      pistaCargadaRef.current = alAire.id;
      pausaDeseadaRef.current = false;
      fijarPista(alAire.empezoISO, alAire.duracionSeg);
      // La UI va con el audio: al terminar una canción, título y artista
      // cambian en el mismo instante en que suena la siguiente.
      setCancion(alAire);
      if (alAire.siguienteId && alAire.siguienteUrl) {
        precargar(alAire.siguienteId, alAire.siguienteUrl);
      }
      await sonarBiblioteca(alAire.audioUrl, segundoVivo, alAire.id);
    } catch {
      setAviso(TEXTOS.falloRed);
    } finally {
      viviendoRef.current = false;
      setIniciando(false);
    }
  }, [sonarBiblioteca, cortarPorSilencio, fijarPista, precargar]);

  vivirRef.current = () => void vivir();

  const alternar = useCallback(() => {
    if (!audioRef.current) {
      void vivir();
      return;
    }
    if (sonandoRef.current) {
      pausaDeseadaRef.current = true;
      audioRef.current.pause();
    } else {
      void vivir();
    }
  }, [vivir]);

  useEffect(() => {
    if (!conectada) return;
    const alPrimerToque = () => {
      if (!sonandoRef.current && !pausaDeseadaRef.current) vivirRef.current();
    };
    document.addEventListener("pointerdown", alPrimerToque, { once: true });
    return () => {
      document.removeEventListener("pointerdown", alPrimerToque);
    };
  }, [conectada]);

  useEffect(() => {
    if (!conectada) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    // Todo el reprogramado pasa por aquí: primero se cancela el latido vivo.
    // Así dos llamadas seguidas (centinela, pestaña que vuelve) nunca dejan
    // dos cadenas de consulta andando en paralelo.
    const programar = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(consultar, ms);
    };

    const consultar = async () => {
      const resultado = await pedirSenal();
      if (!vivo) return;
      if (resultado.tipo === "silencio") {
        cortarPorSilencio(resultado);
        // Durante el silencio se pregunta más seguido: al volver la señal,
        // la escucha vuelve sola.
        programar(15_000);
        return;
      }
      setSilencio(null);
      if (resultado.tipo === "cancion") {
        const nueva = resultado.cancion;
        setCancion(nueva);
        // La señal regresó (o cambió algo en la mesa): el aviso viejo fuera.
        if (!sonandoRef.current) setAviso("");
        // Precarga de la siguiente: mientras más temprano se sabe cuál es,
        // más seguro llega el cambio de canción sin silencio.
        if (nueva.siguienteId && nueva.siguienteUrl) {
          precargar(nueva.siguienteId, nueva.siguienteUrl);
        }
        // La señal volvió: se reanuda donde va si el oyente no pausó a mano.
        if (
          cortadaPorSilencioRef.current &&
          audioRef.current &&
          !pausaDeseadaRef.current
        ) {
          cortadaPorSilencioRef.current = false;
          vivirRef.current();
        }
        let espera: number = RADIO_CONFIG.sinDatosMs;
        if (nueva.duracionSeg && nueva.empezoISO) {
          const restante =
            nueva.duracionSeg * 1000 -
            (Date.now() - new Date(nueva.empezoISO).getTime()) +
            1200;
          espera = Math.max(1200, restante);
        }
        programar(Math.min(espera, RADIO_CONFIG.maximoMs));
        return;
      }
      setCancion(null);
      programar(RADIO_CONFIG.sinDatosMs);
    };

    // El centinela despierta la consulta al instante cuando algo cambia.
    despertarRef.current = () => {
      clearTimeout(timer);
      void consultar();
    };

    consultar();
    const alVolver = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        consultar();
      }
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearTimeout(timer);
      despertarRef.current = () => {};
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [conectada, cortarPorSilencio, precargar]);

  useEffect(() => {
    if (!conectada) return;
    // El centinela: aguanta la respuesta del servidor hasta que algo cambie
    // en media/ (letras, silencios, biblioteca) y lo empuja al instante.
    // Si el long-poll falla, reintenta con calma: los latidos normales siguen.
    let vivo = true;
    let desde = 0;
    let sellosPrevios: Record<string, number> = {};
    const dormir = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms));

    const paso = async () => {
      while (vivo) {
        try {
          const res = await fetch(
            `/api/radio/cambios${desde ? `?desde=${desde}` : ""}`,
            { cache: "no-store" },
          );
          if (!vivo) return;
          if (!res.ok) {
            await dormir(5_000);
            continue;
          }
          const datos = (await res.json()) as {
            version?: number;
            cambios?: Record<string, number>;
          };
          if (!vivo) return;
          const sellos = datos.cambios ?? {};
          let refrescarSenal = false;
          for (const [clave, sello] of Object.entries(sellos)) {
            if (!desde || sellosPrevios[clave] === undefined) continue;
            if (sello === sellosPrevios[clave]) continue;
            if (clave === "letras") invalidarLetras();
            else refrescarSenal = true;
          }
          sellosPrevios = sellos;
          desde = datos.version ?? 0;
          if (refrescarSenal) despertarRef.current();
        } catch {
          if (!vivo) return;
          await dormir(5_000);
        }
      }
    };

    void paso();
    return () => {
      vivo = false;
    };
  }, [conectada]);

  useEffect(() => {
    if (!conectada) return;
    // Vela del silencio: pregunta cada 15 s mientras la señal está cortada
    // y reanuda la escucha en cuanto vuelve (el bucle principal puede estar
    // dormido hasta 5 min).
    const vela = setInterval(() => {
      if (!cortadaPorSilencioRef.current) return;
      (async () => {
        try {
          const resultado = await pedirSenal();
          if (resultado.tipo !== "cancion" || !resultado.cancion.audioUrl) return;
          cortadaPorSilencioRef.current = false;
          setSilencio(null);
          setCancion(resultado.cancion);
          if (!pausaDeseadaRef.current) vivirRef.current();
        } catch {
          /* la vela sigue encendida */
        }
      })();
    }, 15_000);
    return () => clearInterval(vela);
  }, [conectada]);

  useEffect(() => {
    if (!conectada) return;
    const anclar = setInterval(() => {
      if (!pistaCargadaRef.current || !sonandoRef.current) return;
      if (pausaDeseadaRef.current) return;
      const el = audioRef.current;
      if (!el || el.paused) return;
      (async () => {
        try {
          const resultado = await pedirSenal();
          if (resultado.tipo === "silencio") {
            cortarPorSilencio(resultado);
            return;
          }
          if (resultado.tipo !== "cancion") return;
          const senal = resultado.cancion;
          if (!senal.audioUrl || !senal.empezoISO) return;

          if (senal.id !== pistaCargadaRef.current) {
            pistaCargadaRef.current = senal.id;
            fijarPista(senal.empezoISO, senal.duracionSeg);
            const duracion = senal.duracionSeg ?? 0;
            const objetivoMs = Date.now() - new Date(senal.empezoISO).getTime();
            const segundo = Math.max(
              0,
              Math.min(
                objetivoMs / 1000,
                duracion > 0 ? duracion - 3 : Number.MAX_SAFE_INTEGER,
              ),
            );
            await sonarBiblioteca(senal.audioUrl, segundo, senal.id);
            return;
          }

          if (senal.siguienteId && senal.siguienteUrl) {
            precargar(senal.siguienteId, senal.siguienteUrl);
          }
          fijarPista(senal.empezoISO, senal.duracionSeg);
          const objetivoMs = Date.now() - new Date(senal.empezoISO).getTime();
          // Solo se re-ancla con más de 8 s de desvío: un buffering normal no debe dar saltos.
          if (Math.abs(el.currentTime * 1000 - objetivoMs) > 8_000) {
            moverA(el, Math.max(0, objetivoMs / 1000));
          }
        } catch {
          /* un fallo pasajero de anclaje no molesta la escucha */
        }
      })();
    }, 25_000);
    return () => clearInterval(anclar);
  }, [conectada, sonarBiblioteca, cortarPorSilencio, fijarPista, moverA, precargar]);

  useEffect(() => {
    if (!conectada || !cancion?.id) return;
    if (!sonandoRef.current || pausaDeseadaRef.current) return;
    if (cancion.id === pistaCargadaRef.current) return;
    if (!cancion.audioUrl) return;
    pistaCargadaRef.current = cancion.id;
    fijarPista(cancion.empezoISO, cancion.duracionSeg);
    (async () => {
      try {
        const objetivoMs = cancion.empezoISO
          ? Date.now() - new Date(cancion.empezoISO).getTime()
          : 0;
        const duracion = cancion.duracionSeg ?? 0;
        const segundo = Math.max(
          0,
          Math.min(
            objetivoMs / 1000,
            duracion > 0 ? duracion - 3 : Number.MAX_SAFE_INTEGER,
          ),
        );
        await sonarBiblioteca(cancion.audioUrl as string, segundo, cancion.id);
      } catch {
        pistaCargadaRef.current = "";
      }
    })();
  }, [cancion, conectada, sonarBiblioteca, fijarPista]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (precargaRef.current) {
        precargaRef.current.el.pause();
      }
    };
  }, []);

  const [, setTic] = useState(0);
  useEffect(() => {
    if (!cancion?.empezoISO) return;
    const t = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [cancion?.empezoISO]);

  const transcurridoSeg = cancion?.empezoISO
    ? Math.max(0, (Date.now() - new Date(cancion.empezoISO).getTime()) / 1000)
    : 0;

  const avisoMostrado =
    aviso ||
    (!conectada ? "" : !sonando && !silencio ? TEXTOS.esperaPrimerToque : "");

  return {
    cancion,
    sonando,
    transcurridoSeg,
    conectada,
    listo: conectada,
    iniciando,
    silencio,
    aviso: avisoMostrado,
    alternar,
  };
}

export function useOyentes(): number | null {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (!apiConectada()) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    const consultar = async () => {
      const valor = await obtenerOyentes();
      if (vivo && valor !== null) setN(valor);
      if (vivo) timer = setTimeout(consultar, RADIO_CONFIG.oyentesCadaMs);
    };
    consultar();

    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, []);

  return n;
}

export function useLetra(cancion: Cancion | null): {
  lineas: string[] | null;
  cargando: boolean;
  instrumental: boolean;
} {
  const id = cancion?.id;
  /* La versión de letras cambia cuando el dueño pega o borra una letra:
     la pantalla vuelve a pedir la del aire sin recargar la página. */
  const [version, setVersion] = useState(versionLetras);
  useEffect(() => {
    oyentesLetras.add(setVersion);
    return () => {
      oyentesLetras.delete(setVersion);
    };
  }, []);
  const [pedida, setPedida] = useState<{
    id: string;
    lineas: string[] | null;
    instrumental: boolean;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    pedirLetra(id).then((resultado) => {
      if (vivo) setPedida({ id, ...resultado });
    });
    return () => {
      vivo = false;
    };
  }, [id, version]);

  if (!id) return { lineas: null, cargando: false, instrumental: false };
  if (cancion?.letra?.length)
    return { lineas: cancion.letra, cargando: false, instrumental: false };
  if (pedida?.id === id)
    return {
      lineas: pedida.lineas,
      cargando: false,
      instrumental: pedida.instrumental,
    };
  return { lineas: null, cargando: apiConectada(), instrumental: false };
}
