const path = require('path');
const fs = require('fs');
process.env.LD_LIBRARY_PATH = ['/tmp/al2023/lib'];
const puppeteer = require('puppeteer-core');
const mod = require('@sparticuz/chromium');
const C = mod.default;

const OUT_DIR = path.join(__dirname, '..');

(async () => {
  C.setGraphicsMode = false;
  await mod.inflate(path.join(__dirname, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
  await mod.inflate(path.join(__dirname, 'node_modules/@sparticuz/chromium/bin/chromium.br'));
  const p = await C.executablePath();
  const b = await puppeteer.launch({ executablePath: p,
    args: ['--no-sandbox', '--headless=new', '--disable-gpu', '--disable-dev-shm-usage'] });
  const pg = await b.newPage();

  // aperçu 1x
  await pg.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
  await pg.goto('file://' + path.join(__dirname, 'poster.html'), { waitUntil: 'networkidle0' });
  await pg.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 500));
  await pg.screenshot({ path: path.join(__dirname, 'poster-1x.png') });

  // 300 dpi
  await pg.setViewport({ width: 794, height: 1123, deviceScaleFactor: 3.125 });
  await new Promise(r => setTimeout(r, 600));
  await pg.screenshot({ path: path.join(OUT_DIR, 'affiche-la-trattoria-A4.png'), type: 'png' });

  // PDF A4
  await pg.pdf({ path: path.join(OUT_DIR, 'affiche-la-trattoria-A4.pdf'),
    width: '210mm', height: '297mm', printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 } });

  // QR standalone à jour
  fs.copyFileSync(path.join(__dirname, 'qr-site.png'), path.join(OUT_DIR, '..', 'qr', 'QR-site-poster.png'));

  await b.close();
  console.log('affiche rendue (png + pdf) + QR mis à jour');
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
