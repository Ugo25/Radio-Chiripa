
export function cargarImagen(
  url: string,
  topeMs = 5000,
): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolver) => {
    const imagen = new Image();
    imagen.crossOrigin = "anonymous";
    const fuera = setTimeout(() => resolver(null), topeMs);
    imagen.onload = () => {
      clearTimeout(fuera);
      resolver(imagen.naturalWidth > 0 ? imagen : null);
    };
    imagen.onerror = () => {
      clearTimeout(fuera);
      resolver(null);
    };
    imagen.src = url;
  });
}

export async function esperarFuentes(cargas: string[], familia: string): Promise<void> {
  try {
    await Promise.all(cargas.map((c) => document.fonts.load(c)));
    await document.fonts.ready;
    const prueba = `400 20px ${familia}`;
    for (let intento = 0; intento < 8; intento++) {
      if (document.fonts.check(prueba)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch {
    /* sin FontFaceSet utilizable: el respaldo del sistema dibuja igual */
  }
}

// Desenfoque por reducir y amplificar: ctx.filter no existe en Safari viejo y la imagen debe salir igual en todos los navegadores.
export function dibujarDifuminada(
  ctx: CanvasRenderingContext2D,
  imagen: HTMLImageElement,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  fuerza = 16,
): void {
  const mini = document.createElement("canvas");
  mini.width = Math.max(1, Math.round(ancho / fuerza));
  mini.height = Math.max(1, Math.round(alto / fuerza));
  const mctx = mini.getContext("2d");
  if (!mctx) return;
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = "high";
  const escala = Math.max(mini.width / imagen.width, mini.height / imagen.height);
  const w = imagen.width * escala;
  const h = imagen.height * escala;
  mctx.drawImage(imagen, (mini.width - w) / 2, (mini.height - h) / 2, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mini, x, y, ancho, alto);
}

export function rutaRedondeada(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radio = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.lineTo(x + w - radio, y);
  ctx.arcTo(x + w, y, x + w, y + radio, radio);
  ctx.lineTo(x + w, y + h - radio);
  ctx.arcTo(x + w, y + h, x + w - radio, y + h, radio);
  ctx.lineTo(x + radio, y + h);
  ctx.arcTo(x, y + h, x, y + h - radio, radio);
  ctx.lineTo(x, y + radio);
  ctx.arcTo(x, y, x + radio, y, radio);
  ctx.closePath();
}

export function textoAjustado(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  ancho: number,
  tamano: number,
  familia: string,
  peso = 600,
): void {
  let size = tamano;
  do {
    ctx.font = `${peso} ${size}px ${familia}`;
  } while (ctx.measureText(texto).width > ancho && --size > 12);
  ctx.fillText(texto, x, y);
}
