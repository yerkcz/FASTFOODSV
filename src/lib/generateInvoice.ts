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

export async function generateInvoice(
  items: CartItem[],
  total: number,
  meta: OrderMeta = { mesa: "Mesa 1", cliente: "" },
  ordenNu?: string,
  pago?: InvoicePago
): Promise<void> {
  void pago;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");

  const now = crNow();
  const logo = await loadImage("/LogoFastF.jpeg");

  const fontHeader = "11px monospace";
  const fontBody = "11px monospace";
  const fontTotal = "bold 16px monospace";
  const fontBrand = "bold 13px monospace";

  let y = MARGIN + 4;

  const headerLines = [
    "FAST FOOD SAN VICENTE",
    "Sharlin Maclean Vargas",
    "Ident Física: 207960326",
    "Tel: 6081-1275",
    "25mts sureste de la Iglesia Católica de San Vicente",
    "fastfoodsanvicente@gmail.com",
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
  const totalsReserved = LINE_HEIGHT * 4 + 8;
  const footerLines = 2;
  const footerReserved = footerLines * LINE_HEIGHT + 8;

  const height =
    headerReserved + metaReserved + tableHeader + itemReserved + totalsReserved + footerReserved;

  const canvas = ctx.canvas;
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

  drawCenteredText(ctx, "FAST FOOD SAN VICENTE", y, fontBrand);
  y += LINE_HEIGHT;
  drawCenteredText(ctx, "Sharlin Maclean Vargas", y, "10px monospace", "#000");
  y += LINE_HEIGHT;
  drawCenteredText(ctx, "Ident Física: 207960326", y, "10px monospace", "#444");
  y += LINE_HEIGHT;
  drawCenteredText(ctx, "Tel: 6081-1275", y, "10px monospace", "#444");
  y += LINE_HEIGHT;
  drawCenteredText(ctx, "25mts sureste de la Iglesia Católica de San Vicente", y, "10px monospace", "#444");
  y += LINE_HEIGHT;
  drawCenteredText(ctx, "fastfoodsanvicente@gmail.com", y, "10px monospace", "#444");
  y += LINE_HEIGHT;
  drawSolid(ctx, y + 4);
  y += LINE_HEIGHT;

  ctx.font = fontHeader;
  drawLeftRight(ctx, ordenNu ? `ORDEN #${ordenNu.slice(0, 8)}` : "", `Fecha: ${crDateStr(now)}`, y, true);
  y += LINE_HEIGHT;
  drawLeftRight(ctx, `Hora: ${crTimeStr(now)}`, meta.mesa ? meta.mesa.toUpperCase() : "", y);
  y += LINE_HEIGHT;
  if (meta.cliente) {
    drawLeftRight(ctx, `Cliente: ${meta.cliente.slice(0, 22)}`, "", y);
    y += LINE_HEIGHT;
  }
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
  drawLeftRight(ctx, "SUBTOTAL", formatColones(total), y);
  y += LINE_HEIGHT;

  ctx.font = fontTotal;
  ctx.textAlign = "right";
  ctx.fillStyle = "#047857";
  ctx.fillText(`TOTAL  ${formatColones(total)}`, WIDTH_PX - MARGIN, y + 4);
  ctx.fillStyle = "#000";
  y += LINE_HEIGHT + 6;

  drawDashed(ctx, y);
  y += LINE_HEIGHT;

  ctx.font = fontBody;
  ctx.textAlign = "center";
  ctx.fillText("¡Muchas gracias por su preferencia!", WIDTH_PX / 2, y);
  y += LINE_HEIGHT;
  ctx.font = "9px monospace";
  ctx.fillStyle = "#555";
  ctx.fillText("Comprobante interno - Regimen Simplificado", WIDTH_PX / 2, y);

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