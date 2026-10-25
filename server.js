import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.apk': 'application/vnd.android.package-archive',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // APK download route
  if (urlPath === '/app-debug.apk') {
    const apkPath = path.join(__dirname, 'app/build/outputs/apk/debug/app-debug.apk');
    if (fs.existsSync(apkPath)) {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="birdgame-debug.apk"',
      });
      return fs.createReadStream(apkPath).pipe(res);
    }
  }

  // Assets routes
  if (urlPath === '/avatar.png') {
    const p = path.join(__dirname, 'app/src/main/assets/avatar.png');
    if (fs.existsSync(p)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return fs.createReadStream(p).pipe(res);
    }
  }

  if (urlPath === '/obstacle.png') {
    const p = path.join(__dirname, 'app/src/main/assets/obstacle.png');
    if (fs.existsSync(p)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return fs.createReadStream(p).pipe(res);
    }
  }

  // Default to web/index.html
  let filePath = path.join(__dirname, 'web', urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'web', 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'text/html; charset=utf-8';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bird Game Android Simulator server listening on http://0.0.0.0:${PORT}`);
});
