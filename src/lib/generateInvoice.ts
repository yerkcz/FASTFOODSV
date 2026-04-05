import { jsPDF } from "jspdf";

import { type CartItem, type OrderMeta } from "@/types";

function formatColones(amount: number): string {
    const rounded = Math.round(amount).toString();
    return "\u20A1" + rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export async function generateInvoice(
    items: CartItem[],
    total: number,
    meta: OrderMeta = { mesa: "Mesa 10", cliente: "" },
    ordenNu?: string
): Promise<void> {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 25;
    const contentWidth = pageWidth - margin * 2;

    // Col X positions
    const colNameX = margin;
    const colCantX = 130;
    const colPriceX = 155;
    const colTotalX = pageWidth - margin;

    // Load logo
    let logoData: string | null = null;
    try {
        const response = await fetch("/logoHide.png");
        const blob = await response.blob();
        logoData = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch {
        // Logo not available
    }

    let y = 30;

    // ═══════════════════════════════════════
    // HEADER — Minimalist & Elegant
    // ═══════════════════════════════════════

    // Logo Centered
    if (logoData) {
        doc.addImage(logoData, "PNG", pageWidth / 2 - 16, y, 32, 32);
        y += 40;
    } else {
        y += 20;
    }

    // Brand Name
    doc.setTextColor(13, 17, 23);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("HIDEAWAY", pageWidth / 2, y, { align: "center" });

    // Subtitle
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(87, 96, 106);
    doc.setFont("helvetica", "normal");
    doc.text("RESTAURANTE & CAFÉ", pageWidth / 2, y, { align: "center", charSpace: 1 });

    y += 15;

    // Divider
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(margin, y, pageWidth - margin, y);

    // ═══════════════════════════════════════
    // ORDER META INFO
    // ═══════════════════════════════════════
    y += 10;

    const now = new Date();
    const dateStr = now.toLocaleDateString("es-CR", { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString("es-CR", { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' });
    

    doc.setFontSize(10);
    doc.setTextColor(13, 17, 23);

    // Left side: Order & Date
    doc.setFont("helvetica", "bold");
    if (ordenNu) {
        doc.text(`ORDEN: #${ordenNu}`, margin, y);
    }
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${dateStr} ${timeStr}`, margin, y + 6);

    // Right side: Table & Client
    doc.setFont("helvetica", "bold");
    doc.text(meta.mesa.toUpperCase(), pageWidth - margin, y, { align: "right" });

    doc.setFont("helvetica", "normal");
    if (meta.cliente) {
        doc.text(`Cliente: ${meta.cliente}`, pageWidth - margin, y + 6, { align: "right" });
    }

    y += 14;

    // Divider
    doc.setDrawColor(225, 228, 232);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);

    // ═══════════════════════════════════════
    // TABLE HEADER
    // ═══════════════════════════════════════
    y += 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(87, 96, 106);

    doc.text("ARTÍCULO", colNameX, y);
    doc.text("CANT", colCantX, y, { align: "center" });
    doc.text("P. UNIT", colPriceX, y, { align: "right" });
    doc.text("SUBTOTAL", colTotalX, y, { align: "right" });

    y += 4;
    doc.setDrawColor(225, 228, 232);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);

    // ═══════════════════════════════════════
    // TABLE ROWS
    // ═══════════════════════════════════════
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(13, 17, 23);

    items.forEach((item) => {
        if (y > 260) {
            doc.addPage();
            y = 20;
        }

        // Item Name
        doc.setFont("helvetica", "bold");
        doc.text(item.name.substring(0, 42), colNameX, y);

        // Quantity
        doc.setFont("helvetica", "normal");
        doc.setTextColor(87, 96, 106);
        doc.text(String(item.quantity), colCantX, y, { align: "center" });

        // Unit Price
        doc.text(formatColones(item.price), colPriceX, y, { align: "right" });

        // Subtotal
        doc.setTextColor(13, 17, 23);
        doc.text(formatColones(item.price * item.quantity), colTotalX, y, {
            align: "right",
        });

        const noteText = item.notas || item.notes;
        if (noteText) {
            y += 4;
            doc.setFontSize(8);
            doc.setFont("helvetica", "italic");
            doc.setTextColor(139, 148, 158);
            doc.text(`* ${noteText}`, colNameX + 2, y);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
        }

        y += 12;
    });

    // ═══════════════════════════════════════
    // TOTAL SECTION
    // ═══════════════════════════════════════

    // Top line for total
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);

    y += 12;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(13, 17, 23);
    doc.text("TOTAL", pageWidth - margin - 50, y, { align: "right" });

    doc.setFontSize(18);
    doc.setTextColor(5, 150, 105);
    doc.text(formatColones(total), colTotalX, y, { align: "right" });

    // Double line under total
    y += 4;
    doc.setLineWidth(0.3);
    doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);
    y += 1.5;
    doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);

    // ═══════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════
    y += 40;

    doc.setFontSize(10);
    doc.setTextColor(87, 96, 106);
    doc.setFont("helvetica", "normal");
    doc.text("¡Muchas gracias por su preferencia!", pageWidth / 2, y, { align: "center" });

    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(139, 148, 158);
    doc.text("Este comprobante es para control interno.", pageWidth / 2, y, { align: "center" });

    // Save
    const fileName = ordenNu
        ? `Hideaway_Comprobante_${ordenNu}.pdf`
        : `Hideaway_Comprobante_${Date.now()}.pdf`;

    doc.save(fileName);
}
