// One-shot splash generator. Outputs:
//   resources/splash.png       — 2732x2732, black wordmark on cream (#f0ece3)
//   resources/splash-dark.png  — 2732x2732, cream wordmark on #0a0a0a
//
// Embeds Playfair Display Black 900 TTF as base64 inside the SVG so
// the rendered output matches the in-app PlasterHeader exactly,
// regardless of host system font availability.
//
// Letter-spacing matches the CSS -0.02em used by PlasterHeader.
//
// Run once with: node scripts/generate-splash.cjs

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const SIZE = 2732
const FONT_SIZE = 360            // Adjust here for visual sizing
const TEXT_COLOR_LIGHT = '#0a0a0a'
const BG_LIGHT = '#f0ece3'
const TEXT_COLOR_DARK = '#f0ece3'
const BG_DARK = '#0a0a0a'

// Read and base64-encode the font
const fontPath = path.join(__dirname, 'fonts', 'PlayfairDisplay-Black.ttf')
if (!fs.existsSync(fontPath)) {
  console.error(`Font not found at ${fontPath}. Run the curl from Step 1 first.`)
  process.exit(1)
}
const fontB64 = fs.readFileSync(fontPath).toString('base64')

// Letter-spacing: PlasterHeader uses -0.02em. In SVG pixels at this font size:
const letterSpacingPx = -FONT_SIZE * 0.02

function buildSvg(textColor, bgColor) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <style type="text/css">
      @font-face {
        font-family: 'PlayfairDisplayEmbedded';
        font-weight: 900;
        src: url(data:font/truetype;charset=utf-8;base64,${fontB64}) format('truetype');
      }
    </style>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${bgColor}"/>
  <text
    x="${SIZE / 2}"
    y="${SIZE / 2}"
    font-family="PlayfairDisplayEmbedded"
    font-weight="900"
    font-size="${FONT_SIZE}"
    fill="${textColor}"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="${letterSpacingPx}"
  >plaster</text>
</svg>`
}

async function main() {
  const outDir = path.join(__dirname, '..', 'resources')
  fs.mkdirSync(outDir, { recursive: true })

  await sharp(Buffer.from(buildSvg(TEXT_COLOR_LIGHT, BG_LIGHT)))
    .png()
    .toFile(path.join(outDir, 'splash.png'))
  console.log('✓ resources/splash.png')

  await sharp(Buffer.from(buildSvg(TEXT_COLOR_DARK, BG_DARK)))
    .png()
    .toFile(path.join(outDir, 'splash-dark.png'))
  console.log('✓ resources/splash-dark.png')
}

main().catch(err => { console.error(err); process.exit(1) })
