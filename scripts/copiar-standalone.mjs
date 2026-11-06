import { cpSync, existsSync, lstatSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const standalone = path.join(raiz, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("No existe .next/standalone — corre `next build` primero.");
  process.exit(1);
}

// El servidor standalone no trae los assets del cliente ni el public: van aparte.
cpSync(path.join(raiz, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});
if (existsSync(path.join(raiz, "public"))) {
  cpSync(path.join(raiz, "public"), path.join(standalone, "public"), { recursive: true });
}

// server.js hace process.chdir(__dirname): media/ tiene que verse desde ahí.
// Se enlaza (junction en Windows) para que el panel escriba en la carpeta real;
// si el sistema no soporta enlaces, queda una copia.
const destinoMedia = path.join(standalone, "media");
try {
  lstatSync(destinoMedia);
  rmSync(destinoMedia, { recursive: true, force: true });
} catch {}
try {
  symlinkSync(path.join(raiz, "media"), destinoMedia, "junction");
} catch {
  cpSync(path.join(raiz, "media"), destinoMedia, { recursive: true });
  console.log("Aviso: media/ se copió (el sistema no soporta enlaces).");
}

console.log("Standalone listo: .next/standalone");
