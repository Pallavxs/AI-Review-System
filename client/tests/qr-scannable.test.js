import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGoogleThemedQrSvg } from '../qr-generator.js';
import QRCode from '../vendor/qrcode.js';
import jsQR from 'jsqr';

test('QR SVG contains Dula Mobiles logo and required styling elements, without Google G', () => {
  const url = 'https://dulamobiles.vercel.app';
  const svg = generateGoogleThemedQrSvg(url);

  // SVG structure
  assert.ok(svg.includes('<svg'), 'Must produce SVG markup');
  assert.ok(svg.includes('class="google-qr-svg"'), 'Must have google-qr-svg class');

  // Google 4-color palette corner accents
  assert.ok(svg.includes('#4285F4'), 'Must have Google Blue #4285F4');
  assert.ok(svg.includes('#EA4335'), 'Must have Google Red #EA4335');
  assert.ok(svg.includes('#FBBC05'), 'Must have Google Yellow #FBBC05');
  assert.ok(svg.includes('#34A853'), 'Must have Google Green #34A853');

  // Black data modules
  assert.ok(svg.includes('fill="#111827"'), 'Must render high-contrast dark QR modules');

  // Center protective white shield
  assert.ok(svg.includes('<circle'), 'Must render center circular shield');

  // Google G logo must be removed
  assert.ok(
    !svg.includes('M22.56 12.25c0-.78'),
    'Google G vector logo must be removed from the center of the QR code'
  );

  // Dula Mobiles logo elements must be present
  assert.ok(svg.includes('id="dulaLogoClip"'), 'Must define dulaLogoClip clipPath');
  assert.ok(svg.includes('<image'), 'Must render logo <image> element');
  assert.ok(
    svg.includes('dulamobiles.jpeg'),
    'Must reference official Dula Mobiles logo asset (dulamobiles.jpeg)'
  );
  assert.ok(
    svg.includes('fill="#0a0a0a"') || svg.includes('fill="#000000"'),
    'Must include circular dark background for the Dula Mobiles logo'
  );
});

test('Real dynamic QR is genuinely scannable by jsQR decoder with exact URL match', () => {
  const testUrls = [
    'https://dulamobiles.vercel.app',
    'http://localhost:5173',
    'https://search.google.com/local/writereview?placeid=ChIJrbt50xezhzkRh80bAb6PB-E',
  ];

  for (const url of testUrls) {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
    const moduleCount = qr.modules.size;
    const margin = 3;
    const totalSize = moduleCount + margin * 2;
    const center = totalSize / 2;
    const logoRadius = Math.max(2.8, moduleCount * 0.12);

    const scale = 8;
    const imgSize = totalSize * scale;
    const rgba = new Uint8ClampedArray(imgSize * imgSize * 4);
    rgba.fill(255); // White background

    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.modules.get(c, r)) {
          const mx = c + margin;
          const my = r + margin;
          const dist = Math.sqrt((mx + 0.5 - center) ** 2 + (my + 0.5 - center) ** 2);
          // Omit modules under center logo, exactly matching SVG rendering
          if (dist >= logoRadius) {
            for (let py = my * scale; py < (my + 1) * scale; py++) {
              for (let px = mx * scale; px < (mx + 1) * scale; px++) {
                const idx = (py * imgSize + px) * 4;
                rgba[idx] = 17;
                rgba[idx + 1] = 24;
                rgba[idx + 2] = 39;
                rgba[idx + 3] = 255;
              }
            }
          }
        }
      }
    }

    const decoded = jsQR(rgba, imgSize, imgSize);
    assert.ok(decoded, `QR code must decode for url: ${url}`);
    assert.equal(decoded.data, url, `Decoded URL must exactly match encoded URL: ${url}`);
  }
});
