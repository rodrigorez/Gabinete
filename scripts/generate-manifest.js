/**
 * Script Node.js para gerar o manifesto inicial dos assets.
 * Escaneia assets/ recursivamente, calcula SHA-256 e gera manifest.json.
 *
 * Uso: node scripts/generate-manifest.js
 */

const { createHash } = require('crypto');
const { readdir, readFile, stat, writeFile } = require('fs/promises');
const { join, relative } = require('path');

const ASSETS_DIR = 'assets';
const OUTPUT_FILE = join(ASSETS_DIR, 'manifest.json');
const IGNORED = ['.gitkeep', '.DS_Store', 'Thumbs.db', 'manifest.json'];

async function hashFile(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

function detectVariant(filename) {
  const lowMatch = filename.match(/^(.+)_low\.(\w+)$/);
  if (lowMatch) return { variant: 'low', pair: `${lowMatch[1]}_high.${lowMatch[2]}` };
  const highMatch = filename.match(/^(.+)_high\.(\w+)$/);
  if (highMatch) return { variant: 'high', pair: `${highMatch[1]}_low.${highMatch[2]}` };
  return {};
}

function detectStorage(ext, size) {
  const LARGE = ['.glb', '.gltf', '.mp4', '.webm', '.mp3', '.ogg'];
  return (LARGE.includes(ext) || size > 5 * 1024 * 1024) ? 'supabase' : 'local';
}

async function scanDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await scanDir(fullPath));
    } else if (!IGNORED.includes(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  console.log('🔍 Escaneando assets...');
  const files = await scanDir(ASSETS_DIR);
  console.log(`📁 Encontrados ${files.length} arquivos.`);

  const manifest = {
    version: 1,
    timestamp: new Date().toISOString(),
    device_id: 'build-initial',
    files: {}
  };

  for (const filePath of files) {
    const relPath = relative('.', filePath).split('\\').join('/');
    const fileStat = await stat(filePath);
    const sha256 = await hashFile(filePath);
    const ext = '.' + filePath.split('.').pop();
    const filename = filePath.split(/[/\\]/).pop() || '';

    const entry = {
      sha256,
      size: fileStat.size,
      modified: fileStat.mtime.toISOString(),
      storage: detectStorage(ext, fileStat.size)
    };

    const { variant, pair } = detectVariant(filename);
    if (variant) {
      entry.variant = variant;
      const dir = relPath.substring(0, relPath.lastIndexOf('/') + 1);
      entry.pair = dir + pair;
    }

    manifest.files[relPath] = entry;
    console.log(`  ✅ ${relPath} (${(fileStat.size / 1024).toFixed(1)}KB) → ${sha256.substring(0, 12)}...`);
  }

  await writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n💾 Manifesto salvo em ${OUTPUT_FILE}`);
  console.log(`📊 ${Object.keys(manifest.files).length} entradas, versão ${manifest.version}`);
}

main().catch(err => { console.error('❌ Erro:', err); process.exit(1); });
