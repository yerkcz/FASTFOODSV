const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Iniciando navegador Chromium en modo headless...');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Resolvemos la ruta relativa correcta al archivo HTML
    const filePath = path.resolve(__dirname, '../../docs/reporte_bi_demo.html');
    const fileUrl = `file://${filePath}`;
    console.log(`Cargando archivo: ${fileUrl}`);
    
    await page.goto(fileUrl, { waitUntil: 'load' });
    
    // Esperar 2.5 segundos para asegurar que Chart.js dibuje y anime todos los gráficos
    console.log('Esperando que los gráficos terminen de renderizarse...');
    await page.waitForTimeout(2500);
    
    const pdfPath = path.resolve(__dirname, '../../docs/Reporte_Ejecutivo_Analitica.pdf');
    console.log(`Generando PDF en: ${pdfPath}`);
    
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        bottom: '15mm',
        left: '15mm',
        right: '15mm'
      }
    });
    
    console.log('¡PDF Generado Exitosamente!');
  } catch (error) {
    console.error('Error al generar el PDF:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
