import 'dotenv/config';

function integer(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  rtmpHost: process.env.RTMP_HOST ?? '127.0.0.1',
  rtmpPort: integer('RTMP_PORT', 1935),
  httpHost: process.env.HTTP_HOST ?? '127.0.0.1',
  httpPort: integer('HTTP_PORT', 8080),
  databasePath: process.env.DATABASE_PATH ?? './data/multistream.db',
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
};
