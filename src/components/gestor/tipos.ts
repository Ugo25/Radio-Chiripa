
export type Cancion = {
  id: string;
  archivo: string;
  titulo: string;
  artista: string;
  album?: string;
  albumId?: string;
  portada?: string;
  duracionSeg: number;
  tamanoBytes: number;
  subidoISO: string;
  activa: boolean;
  conLetra?: boolean;
  instrumental?: boolean;
};

export type TipoAlbum = "album" | "single" | "ep";

export const NOMBRE_TIPO: Record<TipoAlbum, string> = {
  album: "Álbum",
  single: "Sencillo",
  ep: "EP",
};

export type AlbumPanel = {
  id: string;
  nombre: string;
  tipo: TipoAlbum;
  creadoISO: string;
  canciones: number;
  activas: number;
  duracionSeg: number;
  portada?: string;
  portadaPropia?: boolean;
};

export type ArtistaPanel = {
  nombre: string;
  canciones: number;
  activas: number;
  duracionSeg: number;
  portada?: string;
  albumes: number;
  sueltas: number;
};

export type CuentaPanel = {
  id: string;
  nombre: string;
  correo?: string;
  usuario?: string;
  foto?: string;
  rol: "dueno" | "colaborador";
  activo: boolean;
  creadoISO: string;
  ultimaEntradaISO?: string;
};

export type Quien = {
  tipo: "pin" | "cuenta";
  nombre: string;
  rol: string;
  foto?: string;
};

export type AlAire = {
  id: string;
  titulo: string;
  artista: string;
  album?: string;
  portada?: string;
  duracionSeg?: number;
  empezoISO?: string;
  audioUrl?: string;
};

export type MetaBiblioteca = {
  total: number;
  activas: number;
  tamanoBytes: number;
  tamanoMaximo: number;
};

export type PuntoOyentes = { t: number; n: number };

export type HistorialOyentes = {
  puntos: PuntoOyentes[];
  pico: number;
  promedio: number;
};

export type NocturnoPanel = { activo: boolean; desde: string; hasta: string };

export type EstadoSenal = {
  silenciada: boolean;
  motivo: "emergencia" | "nocturno" | null;
  reanudacionISO?: string;
  nocturno: NocturnoPanel;
};

export type Seccion =
  | "resumen"
  | "biblioteca"
  | "albumes"
  | "letras"
  | "cuentas"
  | "configuracion";

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function formatoDuracion(seg: number): string {
  if (!seg || seg <= 0) return "–:–";
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatoDuracionLarga(seg: number): string {
  if (!seg || seg <= 0) return "0 min";
  const h = Math.floor(seg / 3600);
  const m = Math.round((seg % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function formatoTamano(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function haceCuanto(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "hace un momento";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} día${dias === 1 ? "" : "s"}`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} mese${meses === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function faltaCuanto(iso?: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ya casi";
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `en ${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `en ${horas} h ${resto} min` : `en ${horas} h`;
}
