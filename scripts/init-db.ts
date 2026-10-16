import { StreamDatabase } from '../src/db/database.js';

const db = new StreamDatabase();
db.upsertDestination({
  name: 'twitch', platform: 'twitch', rtmpUrl: 'rtmp://live.twitch.tv/app', streamKey: 'replace-with-twitch-key', enabled: false,
});
db.upsertDestination({
  name: 'youtube', platform: 'youtube', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', streamKey: 'replace-with-youtube-key', enabled: false,
});
db.close();
console.log('Database initialized. Update data/multistream.db or use POST /stream/config.');
