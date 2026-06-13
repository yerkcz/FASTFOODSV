import { jsPDF } from 'jspdf';

function formatColones(amount: number): string {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount).replace('CRC', '₡');
}

export async function generateReportPDF(
  dashboardData: any,
  productsData: any,
  trendsData: any,
  chartRefs: { [key: string]: string } // base64 images of the charts
) {
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.width;
  const marginX = 15;
  const colWidth = (pageWidth - 2 * marginX) / 4;
  
  // PÁGINA 1: PORTADA EJECUTIVA
  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(5, 150, 105);
  doc.text('Reporte Ejecutivo de Operaciones', pageWidth / 2, 25, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(87, 96, 106);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periodo: ${dashboardData.periodo.label.toUpperCase()} (${new Date().toLocaleDateString('es-CR')})`, pageWidth / 2, 33, { align: 'center' });
  
  // Divisor superior
  doc.setDrawColor(5, 150, 105);
  doc.line(marginX, 40, pageWidth - marginX, 40);

  // KPIs
  const { kpis, comparativa } = dashboardData;
  const yKpis = 55;
  
  const drawKpi = (title: string, value: string, sub: string, idx: number, color: number[]) => {
    const x = marginX + (idx * colWidth);
    
    // Background highlight box
    doc.setFillColor(246, 248, 250);
    doc.roundedRect(x, yKpis - 8, colWidth - 5, 25, 2, 2, 'F');
    
    doc.setFontSize(9);
    doc.setTextColor(87, 96, 106);
    doc.text(title, x + (colWidth-5)/2, yKpis, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(13, 17, 23);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + (colWidth-5)/2, yKpis + 8, { align: 'center' });
    
    doc.setFontSize(8);
    // [r, g, b]
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(sub, x + (colWidth-5)/2, yKpis + 14, { align: 'center' });
  };

  const getSub = (val: number) => val >= 0 ? `+${val}% vs ant.` : `${val}% vs ant.`;
  const getColor = (val: number) => val >= 0 ? [5, 150, 105] : [220, 38, 38]; // green / red

  drawKpi('INGRESOS', formatColones(kpis.ingresos_totales), getSub(comparativa.pct_cambio_ingresos), 0, getColor(comparativa.pct_cambio_ingresos));
  drawKpi('ÓRDENES', kpis.total_ordenes.toString(), getSub(comparativa.pct_cambio_ordenes), 1, getColor(comparativa.pct_cambio_ordenes));
  drawKpi('TICKET PROM.', formatColones(kpis.ticket_promedio), getSub(comparativa.pct_cambio_ticket), 2, getColor(comparativa.pct_cambio_ticket));
  drawKpi('ÓRD / DÍA', kpis.ordenes_por_dia.toString(), `CV: ${kpis.coef_variacion}%`, 3, [87, 96, 106]);

  // Gráfico de Tendencia
  let currentY = yKpis + 30;
  if (chartRefs.trend) {
    doc.setFontSize(12);
    doc.setTextColor(13, 17, 23);
    doc.setFont('helvetica', 'bold');
    doc.text('Evolución de Ingresos', marginX, currentY);
    try {
      doc.addImage(chartRefs.trend, 'PNG', marginX, currentY + 5, pageWidth - 2 * marginX, 60);
      currentY += 75;
    } catch (e) {
      console.error(e);
      currentY += 10;
    }
  }

  // Gráficos Pareto y Top Productos
  if (chartRefs.pareto) {
    doc.setFontSize(12);
    doc.setTextColor(13, 17, 23);
    doc.setFont('helvetica', 'bold');
    doc.text('Análisis 80/20 (Pareto)', marginX, currentY);
    try {
      doc.addImage(chartRefs.pareto, 'PNG', marginX, currentY + 5, pageWidth - 2 * marginX, 60);
      currentY += 75;
    } catch (e) {
      console.error(e);
      currentY += 10;
    }
  }

  // Footer Pag 1
  doc.setFontSize(8);
  doc.setTextColor(139, 148, 158);
  doc.text(`Generado: ${new Date().toLocaleString('es-CR')} - Página 1 de 2`, pageWidth/2, 270, { align: 'center' });

  // PÁGINA 2: DISTRIBUCIONES
  doc.addPage();
  currentY = 20;

  // Gráficos Horas y Categorías
  if (chartRefs.peakHours) {
    doc.setFontSize(12);
    doc.setTextColor(13, 17, 23);
    doc.setFont('helvetica', 'bold');
    doc.text('Horas Pico (Golden Hours)', marginX, currentY);
    try {
      // Half width
      doc.addImage(chartRefs.peakHours, 'PNG', marginX, currentY + 5, (pageWidth/2) - 20, 50);
    } catch (e) {
      console.error(e);
    }
  }

  if (chartRefs.donut) {
    doc.setFontSize(12);
    doc.setTextColor(13, 17, 23);
    doc.setFont('helvetica', 'bold');
    doc.text('Desglose Categorías', 110, currentY);
    try {
      doc.addImage(chartRefs.donut, 'PNG', 110, currentY + 5, (pageWidth/2) - 20, 50);
    } catch (e) {
      console.error(e);
    }
  }

  currentY += 65;

  // Tablas Top 5 Productos
  doc.setFontSize(12);
  doc.setTextColor(13, 17, 23);
  doc.setFont('helvetica', 'bold');
  doc.text('Productos de Mayor Impacto', marginX, currentY);
  
  currentY += 10;
  doc.setFontSize(9);
  doc.setTextColor(255);
  doc.setFillColor(5, 150, 105);
  doc.rect(marginX, currentY, pageWidth - 2 * marginX, 8, 'F');
  doc.text('Producto', marginX + 3, currentY + 5);
  doc.text('Categ.', marginX + 80, currentY + 5);
  doc.text('Uds', marginX + 115, currentY + 5);
  doc.text('Ingresos', marginX + 140, currentY + 5);
  doc.text('% Total', marginX + 175, currentY + 5);
  
  currentY += 8;
  doc.setTextColor(87, 96, 106);
  doc.setFont('helvetica', 'normal');
  const topList = dashboardData.top10_productos || productsData.productos.slice(0, 10);
  
  topList.slice(0, 8).forEach((p: any, i: number) => {
    if (i % 2 === 0) {
      doc.setFillColor(246, 248, 250);
      doc.rect(marginX, currentY, pageWidth - 2 * marginX, 8, 'F');
    }
    const nm = p.producto.length > 35 ? p.producto.slice(0, 35) + '...' : p.producto;
    doc.text(nm, marginX + 3, currentY + 5);
    doc.text(p.categoria, marginX + 80, currentY + 5);
    doc.text(p.unidades_vendidas.toString(), marginX + 115, currentY + 5);
    doc.text(formatColones(p.ingresos), marginX + 140, currentY + 5);
    doc.text(p.pct_individual + '%', marginX + 175, currentY + 5);
    currentY += 8;
  });

  // Footer Pag 2
  doc.setFontSize(8);
  doc.setTextColor(139, 148, 158);
  doc.text(`Reporte elaborado por Fast Food San Vicente POS`, pageWidth/2, 266, { align: 'center' });
  doc.text(`Página 2 de 2`, pageWidth/2, 270, { align: 'center' });

  // Save via browser
  doc.save(`FastFoodSV_Reporte_Ejecutivo_${new Date().toISOString().slice(0, 10)}.pdf`);
}
