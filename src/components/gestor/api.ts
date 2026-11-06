import { cabeceraLlave } from "@/lib/llave-cliente";

export async function pedirGestor(
  url: string,
  opciones: RequestInit = {},
): Promise<Response | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...opciones,
      headers: { ...cabeceraLlave(), ...(opciones.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    return new Response(null, { status: 0 });
  }
  if (res.status === 401) return null;
  return res;
}

export function falloRed(res: Response | null): boolean {
  return !res || res.status === 0;
}
