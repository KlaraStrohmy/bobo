// Draws docs/navod/navod-notifikace.png: a schematic of the Bobo settings screen with numbered steps.
// Run from frontend/ (needs @resvg/resvg-js): node ../docs/navod/make-image.cjs
const { Resvg } = require(process.cwd() + '/node_modules/@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const INK = '#2b1f3f', PURPLE = '#6b3fd4', SOFT = '#ece4fb', CREAM = '#fff7e8', LINE = '#e6d3a3', YELLOW = '#ffd84f', GREEN = '#3ccb9c', GREY = '#6b5e82';
const FONT = "Arial Rounded MT Bold, Avenir Next, Helvetica Neue, Arial";
const FONT_TXT = "Avenir Next, Helvetica Neue, Arial";

const W = 1080, H = 1560;
const PX = 70, PY = 250, PW = 470, PH = 1010; // phone frame
const SX = PX + 14, SY = PY + 14;              // screen origin
const t = (x, y, s, size, o = {}) => `<text x="${x}" y="${y}" font-family="${o.font || FONT_TXT}" font-size="${size}" font-weight="${o.w || 500}" fill="${o.fill || INK}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.ls ? `letter-spacing="${o.ls}"` : ''}>${s}</text>`;
const badge = (x, y, n) => `<g><circle cx="${x}" cy="${y}" r="27" fill="${PURPLE}" stroke="${INK}" stroke-width="4"/>${t(x, y + 11, n, 32, { font: FONT, anchor: 'middle', fill: '#fff' })}</g>`;
const ring = (x, y, w, h, r = 18) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${PURPLE}" stroke-width="5" stroke-dasharray="14 9"/>`;

// positions inside the screen (absolute)
const slidersC = [SX + 324, SY + 76];
const card1 = { x: SX + 18, y: SY + 236, w: 406, h: 200 };
const toggle = { x: SX + 336, y: SY + 268, w: 70, h: 40 };
const timeBox = { x: SX + 318, y: SY + 350, w: 90, h: 48 };
const card2 = { x: SX + 18, y: SY + 506, w: 406, h: 250 };
const btn = { x: SX + 40, y: SY + 650, w: 362, h: 70 };

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${CREAM}"/>
<defs><pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="1.8" fill="rgba(107,63,212,0.10)"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
`;

// header
svg += `<rect x="40" y="40" width="${W - 80}" height="150" rx="40" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>`;
svg += t(80, 118, 'Bobo v telefonu', 62, { font: FONT });
svg += t(80, 164, 'Kde zapnout připomínky a notifikace', 32, { w: 700 });
svg += `<g transform="translate(900 66)"><rect width="100" height="100" rx="26" fill="#ffb52e" stroke="${INK}" stroke-width="4"/><path d="M18 52 h64 c0 22 -14 34 -32 34 s-32 -12 -32 -34z" fill="#ff7d66" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><rect x="12" y="46" width="76" height="12" rx="6" fill="#ff7d66" stroke="${INK}" stroke-width="4"/><path d="M26 46 c0 -22 12 -30 24 -30 s24 8 24 30z" fill="#fff4dc" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="38" r="3.5" fill="${INK}"/><circle cx="60" cy="38" r="3.5" fill="${INK}"/><path d="M42 46 q8 7 16 0" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/></g>`;
svg += t(60, 228, 'Nastavení najdeš vpravo nahoře. Schéma obrazovky:', 28, { w: 700, fill: GREY });

// phone
svg += `<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="62" fill="${INK}"/>`;
svg += `<rect x="${SX}" y="${SY}" width="${PW - 28}" height="${PH - 28}" rx="50" fill="${CREAM}"/>`;
svg += `<rect x="${PX + PW / 2 - 52}" y="${PY + 22}" width="104" height="18" rx="9" fill="${INK}"/>`;

// top bar
const yb = SY + 56;
svg += `<rect x="${SX + 22}" y="${yb - 8}" width="54" height="54" rx="15" fill="#ffb52e" stroke="${INK}" stroke-width="3"/>`;
svg += `<path d="M${SX + 32} ${yb + 24} h34 c0 12 -8 19 -17 19 s-17 -7 -17 -19z" fill="#ff7d66" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
svg += `<path d="M${SX + 36} ${yb + 24} c0 -12 6 -16 13 -16 s13 4 13 16z" fill="#fff4dc" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
svg += t(SX + 88, yb + 36, 'bobo', 44, { font: FONT });
// sliders icon + avatar
const [scx, scy] = slidersC;
svg += `<g stroke="${INK}" stroke-width="3.5" stroke-linecap="round" fill="${CREAM}"><line x1="${scx - 15}" y1="${scy - 10}" x2="${scx + 15}" y2="${scy - 10}"/><line x1="${scx - 15}" y1="${scy + 0}" x2="${scx + 15}" y2="${scy + 0}"/><line x1="${scx - 15}" y1="${scy + 10}" x2="${scx + 15}" y2="${scy + 10}"/><circle cx="${scx + 6}" cy="${scy - 10}" r="5"/><circle cx="${scx - 6}" cy="${scy}" r="5"/><circle cx="${scx + 6}" cy="${scy + 10}" r="5"/></g>`;
svg += `<circle cx="${SX + 400}" cy="${scy}" r="25" fill="#e5e9ff" stroke="${INK}" stroke-width="3.5"/>` + t(SX + 400, scy + 8, 'PV', 22, { font: FONT, anchor: 'middle', fill: '#274a9e' });
svg += `<line x1="${SX}" y1="${SY + 118}" x2="${SX + PW - 28}" y2="${SY + 118}" stroke="${LINE}" stroke-width="3"/>`;

// page title + section 1
svg += t(SX + 24, SY + 170, 'Nastavení', 50, { font: FONT });
svg += t(SX + 24, SY + 222, 'DENNÍ PŘIPOMÍNKA', 21, { font: FONT, fill: GREY, ls: 1.5 });
svg += `<rect x="${card1.x}" y="${card1.y}" width="${card1.w}" height="${card1.h}" rx="26" fill="#fff" stroke="${LINE}" stroke-width="3"/>`;
svg += t(card1.x + 24, card1.y + 54, 'Připomínat oběd', 28, { font: FONT });
svg += t(card1.x + 24, card1.y + 86, 'Notifikace den před obědem.', 21, { fill: GREY });
svg += `<line x1="${card1.x + 18}" y1="${card1.y + 100}" x2="${card1.x + card1.w - 18}" y2="${card1.y + 100}" stroke="${LINE}" stroke-width="2"/>`;
svg += t(card1.x + 24, card1.y + 154, 'Čas připomínky', 28, { font: FONT });
svg += t(card1.x + 24, card1.y + 184, 'Kdy ti přijde notifikace.', 21, { fill: GREY });
// toggle (on)
svg += `<rect x="${toggle.x}" y="${toggle.y}" width="${toggle.w}" height="${toggle.h}" rx="20" fill="${GREEN}" stroke="${INK}" stroke-width="3.5"/><circle cx="${toggle.x + toggle.w - 21}" cy="${toggle.y + 20}" r="14" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
// time box
svg += `<rect x="${timeBox.x}" y="${timeBox.y}" width="${timeBox.w}" height="${timeBox.h}" rx="14" fill="#fff" stroke="${INK}" stroke-width="3"/>` + t(timeBox.x + timeBox.w / 2, timeBox.y + 33, '15:00', 25, { font: FONT, anchor: 'middle' });

// section 2
svg += t(SX + 24, SY + 482, 'NOTIFIKACE NA TOMTO ZAŘÍZENÍ', 21, { font: FONT, fill: GREY, ls: 1.2 });
svg += `<rect x="${card2.x}" y="${card2.y}" width="${card2.w}" height="${card2.h}" rx="26" fill="#fff" stroke="${LINE}" stroke-width="3"/>`;
// bell off icon
const bx = card2.x + 54, by = card2.y + 62;
svg += `<circle cx="${bx}" cy="${by}" r="30" fill="#f1ecf8"/><g transform="translate(${bx} ${by})" stroke="${GREY}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M-13 9 h26 l-4 -8 v-9 a9 9 0 0 0 -18 0 v9 z"/><path d="M-4 15 a4 4 0 0 0 8 0"/><line x1="-19" y1="-16" x2="19" y2="18"/></g>`;
svg += t(card2.x + 104, card2.y + 56, 'Notifikace jsou vypnuté', 26, { font: FONT });
svg += t(card2.x + 104, card2.y + 88, 'Povol je, ať ti připomínka dorazí.', 20, { fill: GREY });
svg += `<rect x="${btn.x}" y="${btn.y}" width="${btn.w}" height="${btn.h}" rx="35" fill="${PURPLE}" stroke="${INK}" stroke-width="4"/>` + `<rect x="${btn.x}" y="${btn.y + btn.h + 1}" width="${btn.w}" height="6" rx="3" fill="${INK}"/>`;
svg += t(btn.x + btn.w / 2, btn.y + 45, 'Povolit notifikace', 29, { font: FONT, anchor: 'middle', fill: '#fff' });

// account section (the real page ends with it)
svg += t(SX + 24, SY + 800, 'ÚČET', 21, { font: FONT, fill: GREY, ls: 1.5 });
svg += `<rect x="${SX + 18}" y="${SY + 822}" width="406" height="120" rx="26" fill="#fff" stroke="${LINE}" stroke-width="3"/>`;
svg += `<circle cx="${SX + 66}" cy="${SY + 882}" r="28" fill="#e5e9ff" stroke="${INK}" stroke-width="3.5"/>` + t(SX + 66, SY + 891, 'TY', 24, { font: FONT, anchor: 'middle', fill: '#274a9e' });
svg += t(SX + 112, SY + 876, 'Tvoje jméno', 26, { font: FONT }) + t(SX + 112, SY + 906, 'tvuj.email@strohmy.cz', 20, { fill: GREY });

// highlight rings
svg += ring(scx - 34, scy - 34, 68, 68, 34);
svg += ring(toggle.x - 8, toggle.y - 8, toggle.w + 16, toggle.h + 16, 26);
svg += ring(timeBox.x - 8, timeBox.y - 8, timeBox.w + 16, timeBox.h + 16, 20);
svg += ring(btn.x - 10, btn.y - 10, btn.w + 20, btn.h + 20, 44);

// legend on the right
const LX = 600, LW = 410;
const steps = [
  { n: 1, y: 300, target: [scx + 22, scy - 26], title: 'Klepni na ikonku nastavení', lines: ['Tři posuvníky vpravo nahoře', 'v horní liště aplikace.'] },
  { n: 2, y: 500, target: [toggle.x + toggle.w + 8, toggle.y + 20], title: 'Zapni „Připomínat oběd“', lines: ['Den před obědem ti přijde', 'notifikace s otázkou na zítřek.'] },
  { n: 3, y: 700, target: [timeBox.x + timeBox.w + 8, timeBox.y + 24], title: 'Nastav čas připomínky', lines: ['Musí být před uzávěrkou', 'přihlášek. Výchozí je 15:00.'] },
  { n: 4, y: 872, target: [btn.x + btn.w + 10, btn.y + 35], title: 'Klepni na „Povolit notifikace“', lines: ['Telefon se zeptá, potvrď „Povolit“.', 'Zapíná se zvlášť na každém', 'zařízení (telefon, počítač).'] },
];
for (const s of steps) {
  svg += `<path d="M${s.target[0]} ${s.target[1]} C ${s.target[0] + 40} ${s.target[1]}, ${LX - 60} ${s.y}, ${LX - 28} ${s.y}" fill="none" stroke="${PURPLE}" stroke-width="4" stroke-linecap="round"/>`;
  svg += badge(LX, s.y, s.n);
  svg += t(LX + 48, s.y - 2, s.title, 29, { font: FONT });
  s.lines.forEach((ln, i) => (svg += t(LX + 48, s.y + 36 + i * 32, ln, 25, { fill: GREY })));
}

// iPhone tip + footer
svg += `<rect x="${LX - 30}" y="1040" width="${W - LX + 30 - 40}" height="220" rx="30" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
svg += t(LX, 1090, 'iPhone: důležité', 30, { font: FONT, fill: PURPLE });
['Notifikace fungují jen v aplikaci', 'přidané na plochu (iOS 16.4+).', 'Otevírej Bobo z ikonky na ploše,', 'ne ze Safari.'].forEach((ln, i) => (svg += t(LX, 1129 + i * 33, ln, 25)));

svg += `<rect x="40" y="1300" width="${W - 80}" height="220" rx="40" fill="${SOFT}" stroke="${INK}" stroke-width="4"/>`;
svg += t(80, 1362, 'Připomínka se ptá na zítřek, jestli se vaří a ještě jsi neodpověděla.', 27, { w: 600 });
svg += t(80, 1400, 'Odpovědět jde rovnou z notifikace, aplikace se otevírat nemusí.', 27, { w: 600 });
svg += t(80, 1468, 'bobo-worker.workers.dev', 40, { font: FONT, fill: PURPLE });
svg += t(80, 1500, 'https://bobo.bobo-worker.workers.dev', 25, { fill: GREY });
svg += `</svg>`;

fs.writeFileSync(path.join(__dirname, 'navod-notifikace.svg'), svg);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' } }).render().asPng();
fs.writeFileSync(path.join(__dirname, 'navod-notifikace.png'), png);
console.log('ok', png.length, 'B');
