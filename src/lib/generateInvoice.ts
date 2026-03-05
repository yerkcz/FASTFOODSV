import { jsPDF } from "jspdf";

export type CartItem = {
    id: string;
    name: string;
    price: number;
    quantity: number;
    category: string;
};

export type OrderMeta = {
    mesa: string;
    cliente: string;
    notas: string;
};

function formatColones(amount: number): string {
    return "\u20A1" + amount.toLocaleString("es-CR");
}

export async function generateInvoice(
    items: CartItem[],
    total: number,
    meta: OrderMeta = { mesa: "Mesa 1", cliente: "", notas: "" },
    ordenNu?: string
): Promise<void> {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

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

    // === HEADER ===
    const headerColor: [number, number, number] = [15, 38, 24];
    doc.setFillColor(...headerColor);
    doc.rect(0, 0, pageWidth, 48, "F");

    if (logoData) {
        doc.addImage(logoData, "PNG", 15, 8, 30, 30);
    }

    doc.setTextColor(28, 198, 114);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("HIDEAWAY", 50, 20);

    doc.setFontSize(9);
    doc.setTextColor(180, 210, 180);
    doc.setFont("helvetica", "normal");
    doc.text("Restaurante & Cafe", 50, 28);

    const now = new Date();
    const dateStr = now.toLocaleDateString("es-CR", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const timeStr = now.toLocaleTimeString("es-CR", {
        hour: "2-digit",
        minute: "2-digit",
    });

    doc.setFontSize(8);
    doc.setTextColor(150, 180, 160);
    doc.text(`Fecha: ${dateStr}`, pageWidth - 15, 18, { align: "right" });
    doc.text(`Hora: ${timeStr}`, pageWidth - 15, 24, { align: "right" });
    if (ordenNu) {
        doc.setTextColor(255, 183, 3);
        doc.text(`Orden: ${ordenNu}`, pageWidth - 15, 30, { align: "right" });
    }

    // === ORDER META ===
    let y = 55;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 100, 80);

    doc.setFont("helvetica", "bold");
    doc.text(meta.mesa, 18, y);
    doc.setFont("helvetica", "normal");
    if (meta.cliente) {
        doc.text(`Cliente: ${meta.cliente}`, 60, y);
    }
    y += 6;
    if (meta.notas) {
        doc.setTextColor(180, 140, 20);
        doc.text(`Notas: ${meta.notas.substring(0, 80)}`, 18, y);
        y += 6;
    }
    y += 4;

    // === TABLE HEADER ===
    doc.setFillColor(240, 245, 242);
    doc.rect(15, y - 5, pageWidth - 30, 9, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 198, 114);
    doc.text("ARTICULO", 18, y);
    doc.text("CANT", 110, y, { align: "center" });
    doc.text("P. UNIT", 135, y, { align: "center" });
    doc.text("SUBTOTAL", pageWidth - 18, y, { align: "right" });

    y += 9;

    // === TABLE ROWS ===
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    items.forEach((item, i) => {
        if (y > 260) {
            doc.addPage();
            y = 20;
        }

        if (i % 2 === 0) {
            doc.setFillColor(248, 250, 249);
            doc.rect(15, y - 5, pageWidth - 30, 8, "F");
        }

        doc.setTextColor(40, 60, 40);
        doc.text(item.name.substring(0, 40), 18, y);
        doc.text(String(item.quantity), 110, y, { align: "center" });
        doc.text(formatColones(item.price), 135, y, { align: "center" });
        doc.setTextColor(232, 153, 10);
        doc.text(formatColones(item.price * item.quantity), pageWidth - 18, y, {
            align: "right",
        });

        y += 8;
    });

    // === TOTAL ===
    y += 4;
    doc.setDrawColor(200, 220, 210);
    doc.setLineWidth(0.3);
    doc.line(15, y, pageWidth - 15, y);
    y += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 198, 114);
    doc.text(`TOTAL: ${formatColones(total)}`, pageWidth - 18, y, {
        align: "right",
    });

    // === FOOTER ===
    y += 20;
    doc.setFontSize(10);
    doc.setTextColor(28, 198, 114);
    doc.text("Gracias por su visita!", pageWidth / 2, y, { align: "center" });

    doc.setFontSize(7);
    doc.setTextColor(150, 170, 150);
    doc.text(
        "Hideaway Restaurante & Cafe - Costa Rica",
        pageWidth / 2,
        y + 7,
        { align: "center" }
    );

    const fileName = ordenNu
        ? `Factura_Hideaway_${ordenNu}.pdf`
        : `Factura_Hideaway_${Date.now()}.pdf`;

    doc.save(fileName);
}
