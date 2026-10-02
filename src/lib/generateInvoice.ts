import { type CartItem, type OrderMeta } from "@/types";
import { formatColones } from "@/lib/format";

export type InvoicePago = {
  forma_pago: "efectivo" | "tarjeta" | "sinpe" | "mixto";
  recibido: number;
  vuelto: number;
};

const WIDTH_PX = 302;
const LINE_HEIGHT = 14;
const MARGIN = 8;

function crNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
}

function crDateStr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function crTimeStr(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  font = "bold 14px monospace",
  color = "#000"
) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.fillText(text, WIDTH_PX / 2, y);
}

function drawLeftRight(
  ctx: CanvasRenderingContext2D,
  left: string,
  right: string,
  y: number,
  bold = false
) {
  ctx.fillStyle = "#000";
  ctx.font = bold ? "bold 11px monospace" : "11px monospace";
  ctx.textAlign = "left";
  ctx.fillText(left, MARGIN, y);
  ctx.textAlign = "right";
  ctx.fillText(right, WIDTH_PX - MARGIN, y);
}

function drawDashed(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = "#000";
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(WIDTH_PX - MARGIN, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSolid(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = "#000";
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(WIDTH_PX - MARGIN, y);
  ctx.stroke();
}

function formatItemLine(cant: number, nombre: string, total: number): { cant: string; name: string; total: string } {
  const cantStr = String(cant).padStart(2, " ");
  const totalStr = formatColones(total);
  const maxName = 28;
  const truncated = nombre.length > maxName ? nombre.slice(0, maxName - 1) + "…" : nombre;
  return { cant: cantStr, name: truncated.padEnd(maxName, " "), total: totalStr };
}

export type InvoiceModo = "descargar" | "imprimir";

export async function generateInvoice(
  items: CartItem[],
  total: number,
  meta: OrderMeta = { encabezado: "PEDIDO" },
  ordenNu?: string,
  pago?: InvoicePago,
  // "descargar" = JPEG a la galeria (default, comportamiento previo intacto).
  // "imprimir"  = manda el mismo canvas a la impresora (termica de 80mm).
  modo: InvoiceModo = "descargar",
  // Descuento ya aplicado. Si > 0 se imprime como renglon propio para que el
  // bruto de los items y el TOTAL cobrado dejen de parecer un error de suma.
  descuento = 0
): Promise<void> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");

  const now = crNow();
  const logo = await loadImage("/logo.svg");

  const fontHeader = "11px monospace";
  const fontBody = "11px monospace";
  const fontTotal = "bold 16px monospace";
  const fontBrand = "bold 13px monospace";

  let y = MARGIN + 4;

  // Unica fuente de verdad del encabezado: esta MISMA lista reserva el alto del
  // canvas (headerReserved, abajo) y se dibuja en el bloque de dibujo. Antes
  // estaba escrita dos veces y cambiar una sola desbordaba el ticket.
  const headerLines: Array<{ text: string; font: string; color: string }> = [
    { text: "easystem", font: fontBrand, color: "#000" },
    { text: "Sistema de Punto de Venta", font: "10px monospace", color: "#444" },
  ];
  const headerReserved = (logo ? 70 : 0) + headerLines.length * LINE_HEIGHT + 8;
  const metaLines = 3;
  const metaReserved = metaLines * LINE_HEIGHT + 12;
  const tableHeader = LINE_HEIGHT + 8;
  const itemReserved = items.reduce((sum, it) => {
    const base = LINE_HEIGHT;
    const note = it.notas ? LINE_HEIGHT : 0;
    return sum + base + note;
  }, 0) + 8;
  const pagoReserved = pago ? LINE_HEIGHT * 3 + 8 : 0;
  const totalsReserved = LINE_HEIGHT * 4 + 8;
  const footerLines = 2;
  const footerReserved = footerLines * LINE_HEIGHT + 8;

  const height =
    headerReserved + metaReserved + tableHeader + itemReserved + pagoReserved + totalsReserved + footerReserved;

  canvas.width = WIDTH_PX;
  canvas.height = height;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH_PX, height);

  ctx.fillStyle = "#000";
  ctx.font = fontBody;
  ctx.textBaseline = "top";

  if (logo) {
    const logoSize = 60;
    const cx = WIDTH_PX / 2;
    const cy = y + logoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
    ctx.restore();
    y += logoSize + 4;
  }

  for (const line of headerLines) {
    drawCenteredText(ctx, line.text, y, line.font, line.color);
    y += LINE_HEIGHT;
  }
  drawSolid(ctx, y + 4);
  y += LINE_HEIGHT;

  ctx.font = fontHeader;
  drawLeftRight(ctx, ordenNu ? `ORDEN #${ordenNu.slice(0, 8)}` : "", `Fecha: ${crDateStr(now)}`, y, true);
  y += LINE_HEIGHT;
  drawLeftRight(ctx, `Hora: ${crTimeStr(now)}`, "", y);
  y += LINE_HEIGHT;
  // Antes iba el nombre de la mesa al lado de la hora (y abajo "Cliente:").
  // Con ventas individuales la única línea que aporta es QUIÉN pidió, y vive
  // en `metaPedido()` para que /admin y /inicio manden exactamente esto.
  drawLeftRight(ctx, (meta.encabezado || "PEDIDO").slice(0, 34), "", y);
  y += LINE_HEIGHT;
  drawDashed(ctx, y + 2);
  y += LINE_HEIGHT;

  ctx.font = "bold 10px monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#000";
  ctx.fillText("CANT", MARGIN, y);
  ctx.fillText("ARTICULO", MARGIN + 28, y);
  ctx.textAlign = "right";
  ctx.fillText("TOTAL", WIDTH_PX - MARGIN, y);
  y += LINE_HEIGHT;
  drawDashed(ctx, y);
  y += 4;

  ctx.font = fontBody;
  items.forEach((item) => {
    const line = formatItemLine(item.quantity, item.name, item.price * item.quantity);
    ctx.textAlign = "left";
    ctx.fillStyle = "#000";
    ctx.fillText(line.cant, MARGIN, y);
    ctx.fillText(line.name, MARGIN + 28, y);
    ctx.textAlign = "right";
    ctx.fillText(line.total, WIDTH_PX - MARGIN, y);
    y += LINE_HEIGHT;

    if (item.notas) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#555";
      ctx.font = "italic 9px monospace";
      const note = item.notas.length > 36 ? item.notas.slice(0, 35) + "…" : item.notas;
      ctx.fillText(`* ${note}`, MARGIN + 8, y);
      ctx.font = fontBody;
      ctx.fillStyle = "#000";
      y += LINE_HEIGHT;
    }
  });

  drawSolid(ctx, y + 2);
  y += LINE_HEIGHT;

  ctx.font = "bold 11px monospace";
  drawLeftRight(ctx, "SUBTOTAL", formatColones(total + descuento), y);
  y += LINE_HEIGHT;

  // Solo se pinta si hay descuento: en el caso normal no se agrega una linea
  // vacia que cambie el alto del ticket.
  if (descuento > 0) {
    ctx.fillStyle = "#b91c1c";
    drawLeftRight(ctx, "DESCUENTO", `-${formatColones(descuento)}`, y);
    ctx.fillStyle = "#000";
    y += LINE_HEIGHT;
  }

  ctx.font = fontTotal;
  ctx.textAlign = "right";
  ctx.fillStyle = "#047857";
  ctx.fillText(`TOTAL  ${formatColones(total)}`, WIDTH_PX - MARGIN, y + 4);
  ctx.fillStyle = "#000";
  y += LINE_HEIGHT + 6;

  if (pago) {
    ctx.font = "bold 11px monospace";
    const metodo = pago.forma_pago.charAt(0).toUpperCase() + pago.forma_pago.slice(1);
    drawLeftRight(ctx, `FORMA DE PAGO: ${metodo}`, `Recibido: ${formatColones(pago.recibido)}`, y, true);
    y += LINE_HEIGHT;
    if (pago.vuelto > 0) {
      drawLeftRight(ctx, "", `Vuelto: ${formatColones(pago.vuelto)}`, y);
      y += LINE_HEIGHT;
    }
    drawLeftRight(ctx, "", `Estado: PAGADO`, y);
    y += LINE_HEIGHT;
    drawDashed(ctx, y);
    y += LINE_HEIGHT;
  }

  ctx.font = fontBody;
  ctx.textAlign = "center";
  ctx.fillText("¡Muchas gracias por su preferencia!", WIDTH_PX / 2, y);
  y += LINE_HEIGHT;
  ctx.font = "9px monospace";
  ctx.fillStyle = "#555";
  ctx.fillText("Comprobante interno - Regimen Simplificado", WIDTH_PX / 2, y);

  if (modo === "imprimir") {
    imprimirComprobante(canvas);
    return;
  }

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = ordenNu
    ? `Comprobante_${ordenNu.slice(0, 8)}.jpg`
    : `Comprobante_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Manda el comprobante a la impresora termica.
 *
 * Se reimprime la misma imagen que se descarga (un solo codigo de dibujo, no
 * dos que puedan divergir). El canvas mide 302px ~= 80mm a 96dpi, y la hoja se
 * dimensiona a 80mm sin margenes para que la impresora no intente encogerlo.
 */
function imprimirComprobante(canvas: HTMLCanvasElement): void {
  const w = window.open("", "_blank", "width=340,height=700");
  if (!w) {
    // Popup bloqueado: el boton 🖨️ fue un click, esto casi nunca pasa.
    alert("No se pudo abrir la ventana de impresión. Permite los pop-ups para este sitio.");
    return;
  }
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<title>Comprobante</title><style>` +
      `@page { size: 80mm auto; margin: 0; }` +
      `html,body { margin:0; padding:0; background:#fff; }` +
      `img { display:block; width:80mm; height:auto; }` +
      `@media screen { body { padding: 6px; } }` +
      `</style></head><body>` +
      `<img src="${dataUrl}" onload="setTimeout(function(){window.print()},120)">` +
      `</body></html>`
  );
  w.document.close();
}