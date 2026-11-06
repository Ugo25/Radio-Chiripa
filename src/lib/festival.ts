
export const FESTIVAL = {
  nombre: "Chiripa",
  titulo: "Chiripa 2026",
  subtitulo: "Festival De Música y Arte",
  edicion: "Edición 2026",
  fase: "Fase 1",

  fechas: "8 NOV 2026",
  fechaCorta: "8 NOV",
  fechaISO: "2026-11-08T19:00:00",

  lugar: "Shekinah Beach Club",
  direccion: "Av Camarón Sábalo 702, Sábalo Country, 82100 Mazatlán, Sin.",
  ciudad: "Mazatlán, Sinaloa",

  instagram: "https://www.instagram.com/chiiiripa/",
  instagramArroba: "@chiiiripa",
  instagramDM: "https://ig.me/m/chiiiripa",
  instagramCartel: "https://www.instagram.com/chiiiripa/p/DeVhaFVuaBz/",

  tiktok: "https://www.tiktok.com/@chiiiripa",
  tiktokArroba: "@chiiiripa",

  passlineUrl: "https://www.passline.com/eventos/chiripa-2026",

  sitioUrl: "",
} as const;

export const CARTEL: { nombre: string; nivel: "titular" | "artista" }[] = [
  { nombre: "GRITO ¡EXCLAMACIÓN!", nivel: "titular" },
  { nombre: "HONEY POT", nivel: "titular" },
  { nombre: "Llamenor", nivel: "artista" },
  { nombre: "Trampa Para Hadas", nivel: "artista" },
  { nombre: "Mar De Japón", nivel: "artista" },
  { nombre: "Cast In Lead", nivel: "artista" },
];

export const CARTEL_IMAGEN = "/cartel-2026.jpg";

export const SOBRE = {
  parrafos: [
    "Chiripa reúne propuestas musicales alternativas locales y nacionales, complementando la música en vivo con expresiones de arte.",
    "Más allá de reunir bandas y artistas, Chiripa representa la importancia de generar plataformas independientes.",
  ],
  boletos: "Fase 1 · Passline o DM",
} as const;

export const MENSAJE_COMPARTIR =
  "Chiripa Festival De Música y Arte — 8 NOV 2026 · Shekinah Beach Club, Mazatlán. Boletos Fase 1 en Passline.";

export function sitioActual(): string {
  if (FESTIVAL.sitioUrl) return FESTIVAL.sitioUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
