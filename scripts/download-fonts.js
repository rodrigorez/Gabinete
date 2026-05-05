/**
 * Download de fontes Inter e Outfit para uso offline no museu.
 * Baixa os arquivos woff2 do Google Fonts CDN e gera css/fonts.css.
 *
 * Uso: node scripts/download-fonts.js
 */

import { createWriteStream, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const FONTS_DIR = resolve(ROOT, 'assets/fonts');
const CSS_OUT   = resolve(ROOT, 'css/fonts.css');

// User-Agent de Chrome moderno → Google Fonts responde com woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

// Famílias e pesos necessários no projeto
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap';

async function main() {
  if (!existsSync(FONTS_DIR)) mkdirSync(FONTS_DIR, { recursive: true });

  // 1. Busca o CSS do Google Fonts (para extrair as URLs reais dos woff2)
  console.log('🔍 Buscando metadados de fontes do Google Fonts...');
  const cssRes = await fetch(GOOGLE_FONTS_URL, { headers: { 'User-Agent': UA } });
  if (!cssRes.ok) throw new Error(`Falha ao buscar CSS: ${cssRes.status}`);
  const css = await cssRes.text();

  // 2. Extrai blocos @font-face
  const faceRe = /@font-face\s*\{([^}]+)\}/g;
  const urlRe  = /src:\s*url\(([^)]+\.woff2)\)/;
  const famRe  = /font-family:\s*'?([^';]+)'?/;
  const wgtRe  = /font-weight:\s*(\d+)/;

  /** @type {{ family: string, weight: string, url: string, file: string }[]} */
  const faces = [];
  let m;
  while ((m = faceRe.exec(css)) !== null) {
    const block  = m[1];
    const urlM   = urlRe.exec(block);
    const famM   = famRe.exec(block);
    const wgtM   = wgtRe.exec(block);
    if (!urlM || !famM || !wgtM) continue;

    const family = famM[1].trim();
    const weight = wgtM[1];
    const url    = urlM[1];
    const safeFam = family.replace(/\s+/g, '-');
    const file   = `${safeFam}-${weight}.woff2`;
    faces.push({ family, weight, url, file });
  }

  if (faces.length === 0) throw new Error('Nenhum @font-face encontrado no CSS.');
  console.log(`📦 ${faces.length} variantes de fonte encontradas.`);

  // 3. Baixa cada arquivo woff2
  for (const face of faces) {
    const dest = resolve(FONTS_DIR, face.file);
    if (existsSync(dest)) {
      console.log(`  ✅ Já existe: ${face.file}`);
      continue;
    }
    console.log(`  ⬇️  Baixando: ${face.file} ...`);
    const res = await fetch(face.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) { console.warn(`  ⚠️  Falha ${res.status} — ${face.file}`); continue; }
    await pipeline(res.body, createWriteStream(dest));
    console.log(`  ✅ Salvo: assets/fonts/${face.file}`);
  }

  // 4. Gera css/fonts.css com @font-face locais
  const fontsCss = faces.map(f => `@font-face {
  font-family: '${f.family}';
  font-weight: ${f.weight};
  font-style: normal;
  font-display: swap;
  src: url('../assets/fonts/${f.file}') format('woff2');
}`).join('\n\n');

  writeFileSync(CSS_OUT, `/* Fontes locais — gerado por scripts/download-fonts.js */\n/* Não editar manualmente. Re-execute o script para atualizar. */\n\n${fontsCss}\n`, 'utf8');
  console.log(`\n✅ css/fonts.css gerado com ${faces.length} variante(s).`);
  console.log('📌 Próximo passo: commitar assets/fonts/ e css/fonts.css no repositório.');
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
