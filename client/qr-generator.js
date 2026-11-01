import QRCode from './vendor/qrcode.js';

/**
 * Generates a modern, Google-themed, scannable QR code SVG string with the official Dula Mobiles logo.
 *
 * Encodes the given URL dynamically using Error Correction Level 'H' (30% recovery),
 * rendering crisp black data modules, subtle Google-colored corner accents,
 * a protective white center shield, and the official Dula Mobiles circular logo.
 *
 * @param {string} url - The customer-facing review or feedback URL to encode.
 * @param {object} [options]
 * @param {number} [options.size=240] - Desired SVG display size in pixels.
 * @param {string} [options.logoUrl='/assets/dulamobiles.jpeg'] - Dula Mobiles logo image path or data URI.
 * @returns {string} Fully formed SVG markup.
 */
export function generateGoogleThemedQrSvg(url, options = {}) {
  const displaySize = options.size || 240;
  const logoUrl = options.logoUrl || '/assets/dulamobiles.jpeg';
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const moduleCount = qr.modules.size;
  const margin = 3; // Quiet zone of 3 modules
  const totalSize = moduleCount + margin * 2;
  const center = totalSize / 2;

  // Center logo radius in module coordinates (~12% of total size, leaves >85% area untouched)
  const logoRadius = Math.max(2.8, moduleCount * 0.12);

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

  // Inner circular badge dimensions with comfortable padding inside the white shield
  const innerLogoRadius = logoRadius * 0.86;
  // Zoom 1.14x to cleanly clip out any outer border artifacts of the square asset
  const zoom = 1.14;
  const logoImageSize = innerLogoRadius * 2 * zoom;
  const logoImageOffset = center - logoImageSize / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalSize} ${totalSize}" width="${displaySize}" height="${displaySize}" class="google-qr-svg" role="img" aria-label="QR Code to write Google review for Dula Mobiles">`,
    `  <defs>`,
    `    <!-- Circular Clip Path for Dula Mobiles Logo -->`,
    `    <clipPath id="dulaLogoClip">`,
    `      <circle cx="${center}" cy="${center}" r="${innerLogoRadius}"/>`,
    `    </clipPath>`,
    `  </defs>`,
    ``,
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
    `  <!-- Center Protective White Shield for Dula Mobiles Logo -->`,
    `  <circle cx="${center}" cy="${center}" r="${logoRadius}" fill="#ffffff" stroke="#e5e7eb" stroke-width="0.3"/>`,
    ``,
    `  <!-- Official Dula Mobiles Circular Logo -->`,
    `  <!-- Black circular background -->`,
    `  <circle cx="${center}" cy="${center}" r="${innerLogoRadius}" fill="#0a0a0a"/>`,
    `  <!-- Dula Mobiles logo image (clipped to circle) -->`,
    `  <image href="${logoUrl}" xlink:href="${logoUrl}" x="${logoImageOffset}" y="${logoImageOffset}" width="${logoImageSize}" height="${logoImageSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#dulaLogoClip)"/>`,
    `  <!-- Subtle inner ring -->`,
    `  <circle cx="${center}" cy="${center}" r="${innerLogoRadius}" fill="none" stroke="#ffffff" stroke-width="0.25" opacity="0.6"/>`,
    `</svg>`,
  ].join('\n');
}

export default {
  generateGoogleThemedQrSvg,
};
