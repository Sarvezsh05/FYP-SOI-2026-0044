/**
 * Vulnerable CloudVault Website JSON API (port 8000).
 * Preserves zero-dependency local mode (no Express/CORS/dotenv required).
 * Deliberate vulnerabilities only run when LAB_MODE=true in .env.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { record } = require('./events');
const { send, bad, readJson } = require('./helpers');

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', `http://127.0.0.1:${config.port}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

async function apiHandler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const sourceIp = getClientIp(req);

  // 1. Health check
  if (url.pathname === '/api/health' && req.method === 'GET') {
    return send(res, 200, {
      status: 'success',
      message: 'CloudVault Website API is running!',
      lab_mode: config.lab,
      database_mode: config.mysql ? 'MySQL' : 'Local SQLite'
    });
  }

  // 2. Login JSON endpoint (SQL Injection demo when LAB_MODE=true)
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const data = await readJson(req);
    const email = String(data.email || '');
    const password = String(data.password || '');
    if (!email || !password) return bad(res, 'Email and password are required.', 400);

    if (config.lab) {
      // INTENTIONALLY VULNERABLE (LAB_MODE=true only): unsanitized SQL concatenation
      const sqliPattern = /('|--|;|union\s+select|\bor\b\s+1\s*=\s*1)/i;
      if (sqliPattern.test(email) || sqliPattern.test(password)) {
        await record({ event_type: 'sql_injection_attempt', source_ip: sourceIp, severity: 'high', details: `Login payload: ${email}` });
      }
      const user = await db.one(`SELECT user_id, full_name, email, username, role FROM users WHERE email = '${email}'`);
      if (!user) {
        await record({ event_type: 'failed_login', source_ip: sourceIp, severity: 'medium', details: `Failed login for ${email}` });
        return bad(res, 'Invalid email or password', 401);
      }
      return send(res, 200, { status: 'success', message: 'Login successful (LAB_MODE)', user });
    }

    // Protected mode: parameterized query + password verification
    const user = await db.one('SELECT user_id, full_name, email, username, role, password_hash FROM users WHERE email = ?', [email]);
    if (!user || !db.verifyPassword(password, user.password_hash)) {
      await record({ event_type: 'failed_login', source_ip: sourceIp, severity: 'medium', details: `Failed login for ${email}` });
      return bad(res, 'Invalid email or password', 401);
    }
    const { password_hash, ...safeUser } = user;
    return send(res, 200, { status: 'success', message: 'Login successful', user: safeUser });
  }

  // 3. Files JSON endpoint (IDOR & SQLi search demo when LAB_MODE=true)
  if (url.pathname === '/api/files' && req.method === 'GET') {
    const userId = url.searchParams.get('user_id');
    const search = url.searchParams.get('search');

    if (config.lab) {
      // INTENTIONALLY VULNERABLE (LAB_MODE=true only): no auth check (IDOR) + raw search string (SQLi)
      if (search) {
        if (/('|--|;|union\s+select)/i.test(search)) {
          await record({ event_type: 'sql_injection_attempt', source_ip: sourceIp, severity: 'high', details: `File search: ${search}` });
        }
        const rows = await db.all(`SELECT file_id, user_id, folder_id, file_name, file_type, file_size, local_path, description FROM files WHERE file_name LIKE '%${search}%'`);
        return send(res, 200, { status: 'success', count: rows.length, data: rows });
      }
      if (userId) {
        const rows = await db.all('SELECT file_id, user_id, folder_id, file_name, file_type, file_size, local_path, description FROM files WHERE user_id = ?', [userId]);
        return send(res, 200, { status: 'success', count: rows.length, data: rows });
      }
      const rows = await db.all('SELECT file_id, user_id, folder_id, file_name, file_type, file_size, local_path, description FROM files');
      return send(res, 200, { status: 'success', count: rows.length, data: rows });
    }

    if (req.headers['x-api-key'] !== config.apiKey) return bad(res, 'Unauthorized: Invalid or missing x-api-key header', 401);
    const rows = userId
      ? await db.all('SELECT file_id, user_id, folder_id, file_name, file_type, file_size, description FROM files WHERE user_id = ?', [userId])
      : await db.all('SELECT file_id, user_id, folder_id, file_name, file_type, file_size, description FROM files');
    return send(res, 200, { status: 'success', count: rows.length, data: rows });
  }

  // 4. Folders JSON endpoint (IDOR demo when LAB_MODE=true)
  if (url.pathname === '/api/folders' && req.method === 'GET') {
    if (!config.lab && req.headers['x-api-key'] !== config.apiKey) {
      return bad(res, 'Unauthorized: Invalid or missing x-api-key header', 401);
    }
    const userId = url.searchParams.get('user_id');
    const rows = userId
      ? await db.all('SELECT folder_id, user_id, folder_name FROM folders WHERE user_id = ?', [userId])
      : await db.all('SELECT folder_id, user_id, folder_name FROM folders');
    return send(res, 200, { status: 'success', count: rows.length, data: rows });
  }

  // 5. Users JSON endpoint (Broken Access Control demo when LAB_MODE=true)
  if (url.pathname === '/api/users' && req.method === 'GET') {
    if (!config.lab && req.headers['x-api-key'] !== config.apiKey) {
      return bad(res, 'Unauthorized: Invalid or missing x-api-key header', 401);
    }
    const rows = await db.all('SELECT user_id, full_name, email, username, role FROM users');
    return send(res, 200, { status: 'success', count: rows.length, data: rows });
  }

  // 6. File content JSON endpoint (Path Traversal demo against data/lab-fixtures/dummy-secret.txt when LAB_MODE=true)
  if (url.pathname === '/api/file-content' && req.method === 'GET') {
    const fileParam = url.searchParams.get('file') || '';
    if (!fileParam) return bad(res, 'Missing required query parameter: file', 400);

    const uploadsDir = path.join(config.dataDir, 'uploads');

    if (config.lab) {
      // INTENTIONALLY VULNERABLE (LAB_MODE=true only): allows ../ traversal into data/lab-fixtures/
      if (fileParam.includes('..')) {
        await record({ event_type: 'path_traversal_attempt', source_ip: sourceIp, severity: 'high', details: `Requested file: ${fileParam}` });
      }
      const targetPath = path.join(uploadsDir, fileParam);
      if (!fs.existsSync(targetPath)) return bad(res, 'File not found', 404);
      const content = fs.readFileSync(targetPath, 'utf8');
      return send(res, 200, { status: 'success', file: fileParam, content });
    }

    if (req.headers['x-api-key'] !== config.apiKey) return bad(res, 'Unauthorized: Invalid or missing x-api-key header', 401);
    const safeName = path.basename(fileParam);
    const targetPath = path.join(uploadsDir, safeName);
    if (!fs.existsSync(targetPath)) return bad(res, 'File not found', 404);
    const content = fs.readFileSync(targetPath, 'utf8');
    return send(res, 200, { status: 'success', file: safeName, content });
  }

  return bad(res, 'API endpoint not found', 404);
}

function startApi() {
  const server = http.createServer((req, res) => {
    apiHandler(req, res).catch(err => {
      console.error('API error:', err.message);
      if (!res.headersSent) bad(res, 'Internal API error', 500);
    });
  });
  server.listen(config.apiPort, '127.0.0.1', () => {
    console.log(`CloudVault website API (LAB_MODE=${config.lab}): http://127.0.0.1:${config.apiPort}/api/health`);
  });
  return server;
}

if (require.main === module) {
  db.init().then(startApi).catch(e => {
    console.error(e.message);
    process.exitCode = 1;
  });
}

module.exports = { startApi };