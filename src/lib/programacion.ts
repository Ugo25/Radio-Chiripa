import { ORIGEN_SENAL } from "./senal";

export type PistaSenal = {
  id: string;
  uri: string;
  titulo: string;
  artista: string;
  album: string;
  portada?: string;
  duracionMs: number;
  origen?: "biblioteca";
  audioUrl?: string;
};

let tokenMemo: { valor: string; expira: number } | null = null;

async function obtenerToken(): Promise<string> {
  if (tokenMemo && Date.now() < tokenMemo.expira) return tokenMemo.valor;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
      client_secret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenMemo = {
    valor: json.access_token,
    expira: Date.now() + (json.expires_in - 60) * 1000,
  };
  return tokenMemo.valor;
}

export { obtenerToken };

export type PistaAire = {
  id: string;
  duracionMs: number;
};

// La posición sale del reloj del mundo: (ahora − origen) % duración total. Todos escuchan el mismo minuto.
export function pistaAlAire<T extends PistaAire>(
  pistas: T[],
  origen: number = ORIGEN_SENAL,
): { pista: T; transcurridoMs: number; indice: number } | null {
  const total = pistas.reduce((s, p) => s + p.duracionMs, 0);
  if (total <= 0) return null;

  let pos = (Date.now() - origen) % total;
  if (pos < 0) pos += total;
  for (let i = 0; i < pistas.length; i++) {
    if (pos < pistas[i].duracionMs) {
      return { pista: pistas[i], transcurridoMs: pos, indice: i };
    }
    pos -= pistas[i].duracionMs;
  }
  return { pista: pistas[0], transcurridoMs: 0, indice: 0 };
}
