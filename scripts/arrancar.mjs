import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const servidor = path.join(raiz, ".next", "standalone", "server.js");

if (!existsSync(servidor)) {
  console.error("Falta el build: corre `npm run build` antes de `npm start`.");
  process.exit(1);
}

// El standalone no carga .env.local por su cuenta: se inyecta aquí.
// Las variables del entorno real tienen prioridad sobre el archivo.
const archivo = path.join(raiz, ".env.local");
const delArchivo = {};
if (existsSync(archivo)) {
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual < 1) continue;
    const clave = limpia.slice(0, igual).trim();
    const valor = limpia.slice(igual + 1).trim().replace(/^["']|["']$/g, "");
    if (!(clave in process.env)) delArchivo[clave] = valor;
  }
}

// cwd = raíz del proyecto; media/ se ve por el enlace que dejó el build.
const hijo = spawn(process.execPath, [servidor], {
  stdio: "inherit",
  cwd: raiz,
  env: { ...delArchivo, ...process.env, NODE_ENV: "production" },
});
hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
