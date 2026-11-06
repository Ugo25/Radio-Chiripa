import { obtenerSenalExtendida } from "@/lib/senal-extendida";
import {
  buscarLetra,
  esInstrumental,
  letraGuardada,
  registrarInstrumental,
  registrarLetra,
  registrarSinLetra,
  sinLetraReciente,
} from "@/lib/letras";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idLimpio = id.trim().slice(0, 64);
  if (!idLimpio) return Response.json(null, { status: 404 });

  const idBiblioteca = idLimpio.replace(/^biblio:/, "");

  // Instrumental manda sobre cualquier letra guardada: una canción marcada
  // sin letra nunca devuelve letra, ni auto-encontrada ni vieja.
  if (esInstrumental(idBiblioteca)) {
    return Response.json(
      { instrumental: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const guardada = letraGuardada(idBiblioteca);
  if (guardada) {
    return Response.json(
      { lyrics: guardada },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (sinLetraReciente(idBiblioteca)) {
    return Response.json(null, { status: 404 });
  }

  try {
    const senal = await obtenerSenalExtendida();
    const pista = senal.pistas.find((p) => p.id === idLimpio);
    if (!pista) return Response.json(null, { status: 404 });

    const hallazgo = await buscarLetra(
      pista.titulo,
      pista.artista,
      pista.duracionMs,
    );
    if (!hallazgo) {
      void registrarSinLetra(idBiblioteca, pista.titulo, pista.artista);
      return Response.json(null, { status: 404 });
    }
    if (hallazgo.tipo === "instrumental") {
      void registrarInstrumental(idBiblioteca, pista.titulo, pista.artista);
      return Response.json(
        { instrumental: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    void registrarLetra(idBiblioteca, pista.titulo, pista.artista, hallazgo.texto);
    return Response.json(
      { lyrics: hallazgo.texto },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(null, { status: 503 });
  }
}
