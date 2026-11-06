import { Baloo_2, Inter } from "next/font/google";
import localFont from "next/font/local";

export const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  display: "swap",
});

/* Inter: la cara seria del panel de gestión — nada de redondeces. */
export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const caveman = localFont({
  src: "../app/fonts/prehistoric-caveman.ttf",
  variable: "--font-caveman",
  display: "swap",
  /* El TTF original dibuja en una caja de 2.08 em; este archivo ya viene
     reescalado (unitsPerEm 2048 → 4096) para dibujar en ~1 em. */
});
