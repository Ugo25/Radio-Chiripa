import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad (OWASP secure headers). La vista previa vive
 * dentro de un iframe: NO se envía X-Frame-Options ni frame-ancestors
 * restrictivos (romperían la vista previa); el resto de la protección
 * sí viaja en cada respuesta.
 *
 * OJO: este archivo se evalúa al CONSTRUIR (npm run build), no al
 * arrancar. Las cabeceras que dependen de una perilla de entorno
 * (BLOQUEAR_IFRAMES, BLOQUEAR_HOTLINK, límites por IP) viven en
 * src/proxy.ts, que corre en cada petición y sí lee .env.local sin
 * reconstruir nada.
 *
 * CSP: solo en producción (el modo dev de Next necesita eval y scripts
 * inline para el recargado en caliente). Todavía permite 'unsafe-inline'
 * en script/style — lo que exige el runtime de Next App Router — pero
 * cierra object, base-uri, form-action y limita connect/media a la
 * propia origen (las portadas de Spotify entran por img-src).
 */
const CABECERAS_SEGURIDAD = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Aísla la ventana de la web de cualquier abridor cruzado (anti
  // tabnabbing y fuga por window.opener); no molesta a los enlaces
  // de compartir porque ya viajan con rel="noopener".
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// CSP solo en producción (dev necesita eval); sin X-Frame-Options porque la vista previa vive en un iframe.
const CSP_PRODUCCION = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.scdn.co https://*.scdn.co",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    // Fija la raíz del proyecto: evita que Next confunda carpetas de arriba
    // (p. ej. un package-lock.json en la carpeta personal de Windows).
    root: process.cwd(),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: CABECERAS_SEGURIDAD,
      },
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/:path*",
              headers: [{ key: "Content-Security-Policy", value: CSP_PRODUCCION }],
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
