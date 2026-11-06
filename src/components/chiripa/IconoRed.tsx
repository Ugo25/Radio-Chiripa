"use client";

import { Facebook, Globe, Instagram, Link2, Youtube } from "lucide-react";
import type { Red } from "@/lib/redes-compartir";

export function IconoTikTok({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .6.05.88.13V9.4a6.33 6.33 0 0 0-1-.05A6.34 6.34 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export function IconoX({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z" />
    </svg>
  );
}

/** El dibujo de cada red; lo desconocido va con un lazo genérico. */
export function IconoRed({
  icono,
  className,
}: {
  icono?: string;
  className?: string;
}) {
  switch (icono) {
    case "instagram":
      return <Instagram aria-hidden="true" className={className} />;
    case "tiktok":
      return <IconoTikTok className={className} />;
    case "x":
      return <IconoX className={className} />;
    case "youtube":
      return <Youtube aria-hidden="true" className={className} />;
    case "facebook":
      return <Facebook aria-hidden="true" className={className} />;
    case "web":
      return <Globe aria-hidden="true" className={className} />;
    default:
      return <Link2 aria-hidden="true" className={className} />;
  }
}

/** Cómo se lee una red en texto: @usuario para redes de perfil, dominio para el resto. */
export function etiquetaRed(url: string): string {
  try {
    const u = new URL(url);
    const segmento = u.pathname.split("/").filter(Boolean)[0] ?? "";
    const host = u.hostname.replace(/^www\./, "");
    if (/instagram\.com$|instagr\.am$/.test(host) && segmento) {
      return `@${segmento}`;
    }
    if (/tiktok\.com$/.test(host)) {
      const usuario = segmento.replace(/^@/, "");
      return usuario ? `@${usuario}` : host;
    }
    if (/(x\.com|twitter\.com)$/.test(host) && segmento) {
      return `@${segmento.replace(/^@/, "")}`;
    }
    const ruta = u.pathname.replace(/\/$/, "");
    return ruta && ruta !== "/" ? `${host}${ruta}` : host;
  } catch {
    return url;
  }
}

export type { Red };
