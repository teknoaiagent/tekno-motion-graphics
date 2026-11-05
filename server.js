const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env if present
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = process.env[key] || val;
      }
    }
  }
} catch (e) {}

const PORT = parseInt(process.env.PORT || '8765', 10);
const HOST = '127.0.0.1';
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.map': 'application/json'
};

// SSE Live Reload Clients
const sseClients = new Set();

// Watch for file changes in directory
fs.watch(ROOT_DIR, { recursive: false }, (eventType, filename) => {
  if (filename && (filename.endsWith('.html') || filename.endsWith('.js') || filename.endsWith('.css'))) {
    console.log(`[TEKNO MOTION GRAPHICS Dev] File changed: ${filename} -> Triggering live reload`);
    for (const res of sseClients) {
      try {
        res.write('data: reload\n\n');
      } catch (e) {
        sseClients.delete(res);
      }
    }
  }
});

const LIVE_RELOAD_SCRIPT = `
<!-- Auto Motion Dev Live Reload Client -->
<script>
(() => {
  try {
    const es = new EventSource('/__livereload');
    es.onmessage = (e) => {
      if (e.data === 'reload') {
        console.log('[Dev Server] Reloading page due to file changes...');
        location.reload();
      }
    };
    es.onerror = () => {
      // Reconnect silently
    };
  } catch (err) {}
})();
</script>
</body>`;

const server = http.createServer((req, res) => {
  // Handle SSE live reload endpoint
  if (req.url === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Handle Health Check
  if (req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', app: 'TEKNO MOTION GRAPHICS Dev Server', port: PORT }));
    return;
  }

  // Optional: Gemini API proxy route to bypass potential client-side CORS issues if desired
  if (req.url.startsWith('/api/gemini/')) {
    const targetPath = req.url.replace('/api/gemini', '');
    const targetUrl = `https://generativelanguage.googleapis.com${targetPath}`;
    
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;

    // Inject server GEMINI_API_KEY if client didn't supply one
    if (process.env.GEMINI_API_KEY && !headers['x-goog-api-key']) {
      headers['x-goog-api-key'] = process.env.GEMINI_API_KEY;
    }

    const proxyReq = https.request(targetUrl, {
      method: req.method,
      headers: headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // Static File Serving
  let reqPath = req.url.split('?')[0].split('#')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 Fallback to index.html for SPA if not an asset request
      if (!path.extname(reqPath) || reqPath.endsWith('.html')) {
        const indexPath = path.join(ROOT_DIR, 'index.html');
        return fs.readFile(indexPath, 'utf8', (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
          }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          const injected = content.includes('</body>') 
            ? content.replace('</body>', LIVE_RELOAD_SCRIPT) 
            : content + LIVE_RELOAD_SCRIPT;
          res.end(injected);
        });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Support HTTP 206 Partial Content (Range Requests) for video & audio seeking
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm' || ext === '.wav' || ext === '.mp3')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
      return;
    }

    // HTML injection for live reload
    if (ext === '.html') {
      fs.readFile(filePath, 'utf8', (readErr, content) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          return res.end('Internal Server Error');
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        const injected = content.includes('</body>') 
          ? content.replace('</body>', LIVE_RELOAD_SCRIPT) 
          : content + LIVE_RELOAD_SCRIPT;
        res.end(injected);
      });
      return;
    }

    // Default static file streaming
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`  🚀 TEKNO MOTION GRAPHICS Localhost Full Dev Ready! `);
  console.log(`  URL: http://${HOST}:${PORT}`);
  console.log(`  Dev Mode: http://${HOST}:${PORT}/#dev`);
  console.log(`  Serving from: ${ROOT_DIR}`);
  console.log(`====================================================`);
});
