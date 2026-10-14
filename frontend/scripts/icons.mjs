// Rasterizes public/favicon.svg (and a full-bleed maskable variant) into PNG icons.
// Run with `npm run icons`; the generated PNGs are committed to public/.
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const pub = new URL('../public/', import.meta.url);
const logo = readFileSync(new URL('favicon.svg', pub), 'utf8');
const maskable = readFileSync(new URL('../scripts/maskable.svg', pub), 'utf8');

const render = (svg, size, name) => {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(name, pub), png);
  console.log(`${name} (${size}px)`);
};

render(logo, 192, 'icon-192.png');
render(logo, 512, 'icon-512.png');
render(maskable, 512, 'icon-maskable-512.png');
render(maskable, 180, 'apple-touch-icon.png');
