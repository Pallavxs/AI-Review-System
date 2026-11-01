import QRCode from './vendor/qrcode.js';

/**
 * Generates a modern, Google-themed, scannable QR code SVG string.
 *
 * Encodes the given URL dynamically using Error Correction Level 'H' (30% recovery),
 * rendering crisp black data modules, subtle Google-colored corner accents,
 * and a centered 4-color Google "G" logo.
 *
 * @param {string} url - The customer-facing review or feedback URL to encode.
 * @param {object} [options]
 * @param {number} [options.size=240] - Desired SVG display size in pixels.
 * @returns {string} Fully formed SVG markup.
 */
export function generateGoogleThemedQrSvg(url, options = {}) {
  const displaySize = options.size || 240;
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const moduleCount = qr.modules.size;
  const margin = 3; // Quiet zone of 3 modules
  const totalSize = moduleCount + margin * 2;
  const center = totalSize / 2;

  // Center logo radius in module coordinates (~12% of total size, leaves >85% area untouched)
  const logoRadius = Math.max(2.8, moduleCount * 0.12);
  const logoDiameter = logoRadius * 2;

  // Build module path data for dark modules outside the logo zone
  let modulePaths = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (qr.modules.get(c, r)) {
        const mx = c + margin;
        const my = r + margin;
        // Euclidean distance from cell center to the center of the QR
        const dist = Math.sqrt((mx + 0.5 - center) ** 2 + (my + 0.5 - center) ** 2);
        if (dist >= logoRadius) {
          modulePaths += `M${mx},${my}h1v1h-1z `;
        }
      }
    }
  }

  // Corner accent dimensions (placed cleanly in the outer margin)
  const cornerArm = Math.min(5, margin + 2);
  const cornerOffset = 0.8;
  const cornerRadius = 1.6;
  const strokeWidth = 0.85;

  const logoIconSize = logoRadius * 1.45;
  const logoIconOffset = center - logoIconSize / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${displaySize}" height="${displaySize}" class="google-qr-svg" role="img" aria-label="QR Code to write Google review">`,
    `  <!-- Clean White Card Background -->`,
    `  <rect width="100%" height="100%" fill="#ffffff" rx="4"/>`,
    ``,
    `  <!-- Google-Inspired Corner Accents -->`,
    `  <!-- Top-Left (Google Blue) -->`,
    `  <path d="M${cornerOffset},${cornerOffset + cornerArm} V${cornerOffset + cornerRadius} A${cornerRadius},${cornerRadius} 0 0 1 ${cornerOffset + cornerRadius},${cornerOffset} H${cornerOffset + cornerArm}" fill="none" stroke="#4285F4" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    `  <!-- Top-Right (Google Red) -->`,
    `  <path d="M${totalSize - cornerOffset - cornerArm},${cornerOffset} H${totalSize - cornerOffset - cornerRadius} A${cornerRadius},${cornerRadius} 0 0 1 ${totalSize - cornerOffset},${cornerOffset + cornerRadius} V${cornerOffset + cornerArm}" fill="none" stroke="#EA4335" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    `  <!-- Bottom-Left (Google Yellow) -->`,
    `  <path d="M${cornerOffset},${totalSize - cornerOffset - cornerArm} V${totalSize - cornerOffset - cornerRadius} A${cornerRadius},${cornerRadius} 0 0 0 ${cornerOffset + cornerRadius},${totalSize - cornerOffset} H${cornerOffset + cornerArm}" fill="none" stroke="#FBBC05" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    `  <!-- Bottom-Right (Google Green) -->`,
    `  <path d="M${totalSize - cornerOffset - cornerArm},${totalSize - cornerOffset} H${totalSize - cornerOffset - cornerRadius} A${cornerRadius},${cornerRadius} 0 0 0 ${totalSize - cornerOffset},${totalSize - cornerOffset - cornerRadius} V${totalSize - cornerOffset - cornerArm}" fill="none" stroke="#34A853" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    ``,
    `  <!-- Black QR Data Modules -->`,
    `  <path fill="#111827" d="${modulePaths}" shape-rendering="crispEdges"/>`,
    ``,
    `  <!-- Center White Shield for Google 'G' -->`,
    `  <circle cx="${center}" cy="${center}" r="${logoRadius}" fill="#ffffff" stroke="#e5e7eb" stroke-width="0.3"/>`,
    ``,
    `  <!-- Official 4-Color Google 'G' Vector Icon -->`,
    `  <svg x="${logoIconOffset}" y="${logoIconOffset}" width="${logoIconSize}" height="${logoIconSize}" viewBox="0 0 24 24">`,
    `    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>`,
    `    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>`,
    `    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>`,
    `    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>`,
    `  </svg>`,
    `</svg>`,
  ].join('\n');
}

export default {
  generateGoogleThemedQrSvg,
};

