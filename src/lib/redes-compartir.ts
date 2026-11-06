/**
 * Piezas compartidas de las redes sociales (sin Node): el tipo, los iconos
 * disponibles y el adivinador de icono por dominio. Lo usan la radio y el
 * panel; la lectura/escritura en disco vive en lib/redes.ts.
 */

export type Red = {
  nombre: string;
  url: string;
  icono: string; // instagram | tiktok | x | youtube | facebook | web
};

export const ICONOS_RED = [
  "instagram",
  "tiktok",
  "x",
  "youtube",
  "facebook",
  "web",
] as const;

export function iconoValido(v: unknown): string {
  const candidato = typeof v === "string" ? v.trim() : "";
  return (ICONOS_RED as readonly string[]).includes(candidato)
    ? candidato
    : "web";
}

/** Detecta el icono por el dominio, para no hacerlo a mano cada vez. */
export function adivinarIcono(url: string): string {
  const u = url.toLowerCase();
  if (/(^|\.)instagram\.com|instagr\.am/.test(u)) return "instagram";
  if (/(^|\.)tiktok\.com/.test(u)) return "tiktok";
  if (/(^|\.)(x\.com|twitter\.com)/.test(u)) return "x";
  if (/(^|\.)youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/(^|\.)facebook\.com|fb\.me/.test(u)) return "facebook";
  return "web";
}
