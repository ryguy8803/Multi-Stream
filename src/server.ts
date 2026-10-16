import http from 'node:http';
import net from 'node:net';
import { RtmpSession } from './rtmp/session.js';
import { StreamDatabase } from './db/database.js';
import { config } from './config.js';

const db = new StreamDatabase();
const sessions = new Set<RtmpSession>();
const rtmpServer = net.createServer((socket) => {
  socket.setNoDelay(true);
  const session = new RtmpSession(socket, db); sessions.add(session);
  socket.once('close', () => sessions.delete(session));
});
const httpServer = http.createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  try {
    if (request.method === 'GET' && request.url === '/status') {
      response.end(JSON.stringify({ ok: true, sessions: [...sessions].map((session) => session.status), destinations: db.getEnabledDestinations().map(({ streamKey, ...safe }) => safe) })); return;
    }
    if (request.method === 'GET' && request.url === '/stream/config') { response.end(JSON.stringify(db.getEnabledDestinations().map(({ streamKey, ...safe }) => ({ ...safe, configured: Boolean(streamKey) })))); return; }
    if (request.method === 'POST' && request.url === '/stream/config') {
      const body = await readBody(request); const parsed = JSON.parse(body) as { name?: string; platform?: string; rtmpUrl?: string; streamKey?: string; enabled?: boolean };
      if (!parsed.name || !parsed.platform || !parsed.rtmpUrl || !parsed.streamKey) throw new Error('name, platform, rtmpUrl and streamKey are required');
      db.upsertDestination({ name: parsed.name, platform: parsed.platform, rtmpUrl: parsed.rtmpUrl, streamKey: parsed.streamKey, enabled: parsed.enabled }); response.statusCode = 201; response.end(JSON.stringify({ ok: true })); return;
    }
    response.statusCode = 404; response.end(JSON.stringify({ error: 'not found' }));
  } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'bad request' })); }
});
function readBody(request: http.IncomingMessage): Promise<string> { return new Promise((resolve, reject) => { let body = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { body += chunk; if (body.length > 1024 * 1024) reject(new Error('request too large')); }); request.on('end', () => resolve(body)); request.on('error', reject); }); }
rtmpServer.listen(config.rtmpPort, config.rtmpHost, () => console.log(`RTMP listening on ${config.rtmpHost}:${config.rtmpPort}`));
httpServer.listen(config.httpPort, config.httpHost, () => console.log(`HTTP listening on http://${config.httpHost}:${config.httpPort}`));
function shutdown(signal: string): void { console.log(`${signal}: shutting down`); rtmpServer.close(); httpServer.close(); for (const session of sessions) session.destroy(); db.close(); }
process.once('SIGINT', () => shutdown('SIGINT')); process.once('SIGTERM', () => shutdown('SIGTERM'));
