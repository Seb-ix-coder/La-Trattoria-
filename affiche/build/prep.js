// Préparation : QR code site public + logo en cercle transparent
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const JSQR = require('jsqr');
const { PNG } = require('pngjs');

const SITE_URL = 'https://latrattoria-saintes.fr/';

// ---------- 1) QR code du site ----------
QRCode.toFile(path.join(__dirname, 'qr-site.png'), SITE_URL, {
  width: 1024, margin: 4, errorCorrectionLevel: 'M',
  color: { dark: '#1C1C1A', light: '#FDFAF3' },
}).then(() => {
  // ---------- 3) vérification du QR ----------
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, 'qr-site.png')));
  const q = JSQR(png.data, png.width, png.height);
  console.log('QR décodé :', q ? q.data : 'ÉCHEC');
  if (!q || q.data !== SITE_URL) process.exit(1);
}).catch((e) => { console.error(e); process.exit(1); });

// ---------- 2) logo en cercle transparent ----------
function cropLogo(src, dst) {
  const im = PNG.sync.read(fs.readFileSync(src));
  const w = im.width, h = im.height;
  // bbox du cercle rouge
  let minx = w, miny = h, maxx = 0, maxy = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (w * y + x) << 2;
      const r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      if (r > 90 && g < 90 && b < 90) {
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
    }
  }
  const side = Math.min(maxx - minx, maxy - miny);
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const x0 = Math.round(cx - side / 2), y0 = Math.round(cy - side / 2);
  const out = new PNG({ width: side, height: side });
  const feather = 4;
  const R = side / 2;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const si = (w * sy + sx) << 2;
      const di = (side * y + x) << 2;
      out.data[di] = im.data[si];
      out.data[di + 1] = im.data[si + 1];
      out.data[di + 2] = im.data[si + 2];
      const d = Math.sqrt((x - R + 0.5) ** 2 + (y - R + 0.5) ** 2);
      let a;
      if (d <= R - feather) a = 255;
      else if (d >= R) a = 0;
      else a = Math.round(255 * (R - d) / feather);
      out.data[di + 3] = a;
    }
  }
  fs.writeFileSync(dst, PNG.sync.write(out));
  console.log('logo-cercle.png:', side + 'x' + side);
}
cropLogo(path.join(__dirname, 'logo-trattoria-src.png'), path.join(__dirname, 'logo-cercle.png'));
