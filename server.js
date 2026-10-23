'use strict';
// TraceLens server. Zero dependencies: Node 18+ only.
const http = require('http');
const fs = require('fs');
const path = require('path');

// Tiny .env loader (so Windows users don't need extra tooling)
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (e) { console.warn('Could not read .env:', e.message); }

const { investigate } = require('./lib/analyze');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const DEMO = {
  title: 'pallets/click #2246: flag option with multiple=True raises TypeError',
  repoUrl: 'https://github.com/pallets/click',
  issueNumber: 2246,
  description: 'Flags with multiple=True raise a TypeError when the flag is not passed. It worked in Click 7.1.2 but fails in 8.0.4 and 8.1.2 unless default=() is set.',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('Request too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return send(res, 200, { githubAuthenticated: Boolean(process.env.GITHUB_TOKEN), llmEnabled: Boolean(process.env.ANTHROPIC_API_KEY), demo: DEMO });
    }

    if (req.method === 'POST' && url.pathname === '/api/investigate') {
      let input;
      try { input = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'Invalid JSON body.' }); }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      const write = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n'); };
      try {
        const result = await investigate(
          { repoUrl: input.repoUrl, description: input.description, issueNumber: input.issueNumber ? Number(input.issueNumber) : null },
          (s) => write({ type: 'step', ...s })
        );
        write({ type: 'result', result });
      } catch (e) {
        write({ type: 'error', code: e.code || 'internal', message: e.message || 'Unexpected error', resetsAt: e.rateLimit && e.rateLimit.resetsAt });
        if (!e.code) console.error(e);
      }
      return res.end();
    }

    if (req.method === 'GET') {
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
      fs.readFile(file, (err, buf) => {
        if (err) return send(res, 404, 'Not found', 'text/plain');
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
      return;
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Server error' }); else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n  TraceLens is running:  http://localhost:${PORT}`);
  console.log(`  GitHub auth: ${process.env.GITHUB_TOKEN ? 'token set (5,000 req/hr)' : 'none (60 req/hr: add GITHUB_TOKEN in .env for real use)'}`);
  console.log(`  AI hypotheses: ${process.env.ANTHROPIC_API_KEY ? 'enabled (Claude)' : 'off (rule-based hypotheses; still works)'}\n`);
});
