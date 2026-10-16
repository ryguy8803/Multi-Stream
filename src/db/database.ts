import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

export interface Destination {
  name: string;
  platform: 'twitch' | 'youtube' | string;
  rtmpUrl: string;
  streamKey: string;
  enabled: number;
}

export class StreamDatabase {
  readonly db: Database.Database;

  constructor(file = config.databasePath) {
    const absolute = path.resolve(file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    this.db = new Database(absolute);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS destinations (
      name TEXT PRIMARY KEY, platform TEXT NOT NULL, rtmp_url TEXT NOT NULL,
      stream_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  getEnabledDestinations(): Destination[] {
    return this.db.prepare('SELECT name, platform, rtmp_url as rtmpUrl, stream_key as streamKey, enabled FROM destinations WHERE enabled = 1 ORDER BY name')
      .all() as Destination[];
  }

  upsertDestination(destination: Omit<Destination, 'enabled'> & { enabled?: boolean }): void {
    this.db.prepare(`INSERT INTO destinations(name, platform, rtmp_url, stream_key, enabled)
      VALUES (@name, @platform, @rtmpUrl, @streamKey, @enabled)
      ON CONFLICT(name) DO UPDATE SET platform=excluded.platform, rtmp_url=excluded.rtmp_url,
      stream_key=excluded.stream_key, enabled=excluded.enabled`).run({
        ...destination,
        enabled: destination.enabled === false ? 0 : 1,
      });
  }

  close(): void { this.db.close(); }
}
