
const CLAVE_TOKEN = "chiripa-gestor-token";

export function guardarToken(token: string): void {
  try {
    window.sessionStorage.setItem(CLAVE_TOKEN, token);
  } catch {
    // Sin almacenamiento disponible: queda la cookie como respaldo.
  }
}

export function leerToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(CLAVE_TOKEN) ?? "";
  } catch {
    return "";
  }
}

export function borrarToken(): void {
  try {
    window.sessionStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // Nada que borrar.
  }
}

export function cabeceraLlave(): Record<string, string> {
  const token = leerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
