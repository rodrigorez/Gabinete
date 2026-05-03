const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const RAW_DIR = path.join(__dirname, '../assets/images');
const OUT_DIR = path.join(__dirname, '../assets/images');

// Garante existência das pastas
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function processImages() {
  const files = fs.readdirSync(RAW_DIR);
  const images = files.filter(f => /^02_.*\.(png|jpg|jpeg)$/i.test(f));

  if(images.length === 0) {
    console.log('🖼️ Nenhuma imagem brutas nas pastas assets/raw. Adicione seus .png e .jpg lá.');
    return;
  }

  console.log(`🚀 Iniciando o processamento pesado PWA de ${images.length} assets...`);

  for (const file of images) {
    const filePath = path.join(RAW_DIR, file);
    const parsed = path.parse(file);

    // High Res (1024px)
    await sharp(filePath)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(OUT_DIR, `${parsed.name}_high.webp`));

    // Low Res (512px) - para o Hardware Profiler atuar
    await sharp(filePath)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 60 })
      .toFile(path.join(OUT_DIR, `${parsed.name}_low.webp`));

    console.log(`✅ ${file} -> _high.webp (1024px) / _low.webp (512px) gerados com sucesso.`);
  }

  console.log('🎉 Processamento de Assets Finalizado. Prontos para rodar no Android Kiosk!');
}

processImages();
