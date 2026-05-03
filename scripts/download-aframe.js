const https = require('https');
const fs = require('fs');
const path = require('path');

const AFRAME_URL = 'https://aframe.io/releases/1.4.2/aframe.min.js';
const VENDOR_DIR = path.join(__dirname, '../js/vendor');
const FILE_PATH = path.join(VENDOR_DIR, 'aframe.min.js');

if (!fs.existsSync(VENDOR_DIR)) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
}

console.log(`📦 Baixando A-Frame (Offline First) de: ${AFRAME_URL}...`);

const file = fs.createWriteStream(FILE_PATH);

https.get(AFRAME_URL, (response) => {
  if (response.statusCode !== 200) {
    console.error(`❌ Erro no download: Status ${response.statusCode}`);
    return;
  }

  response.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log(`✅ aframe.min.js salvo com sucesso em: ${FILE_PATH}`);
    console.log(`🚀 O Gabinete Virtual agora é 100% Offline.`);
  });
}).on('error', (err) => {
  fs.unlink(FILE_PATH, () => {});
  console.error(`❌ Falha de rede: ${err.message}`);
});
