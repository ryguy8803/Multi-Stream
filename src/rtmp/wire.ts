import { Buffer } from 'node:buffer';
import { encodeAmf0, type AmfValue } from './amf0.js';

export function basicHeader(format: number, csid: number): Buffer { if (csid < 64) return Buffer.from([(format << 6) | csid]); if (csid < 320) return Buffer.from([format << 6, csid - 64]); throw new Error('CSIDs above 319 are not supported by this implementation'); }
export function rtmpMessage(typeId: number, streamId: number, payload: Buffer, timestamp = 0, csid = 3): Buffer {
  const chunks: Buffer[] = []; const first = Buffer.alloc(11); first.writeUIntBE(Math.min(timestamp, 0xffffff), 0, 3); first.writeUIntBE(payload.length, 3, 3); first[6] = typeId; first.writeUInt32LE(streamId, 7); chunks.push(Buffer.concat([basicHeader(0, csid), first, timestamp >= 0xffffff ? Buffer.from([timestamp >>> 24, timestamp >>> 16, timestamp >>> 8, timestamp]) : Buffer.alloc(0), payload.subarray(0, 128)]));
  for (let offset = 128; offset < payload.length; offset += 128) chunks.push(Buffer.concat([basicHeader(3, csid), payload.subarray(offset, offset + 128)]));
  return Buffer.concat(chunks);
}
export function command(type: '_result' | 'onStatus', streamId: number, values: AmfValue[]): Buffer { return rtmpMessage(20, streamId, encodeAmf0(...values), 0, 3); }
export function windowAcknowledgement(size = 2500000): Buffer { const payload = Buffer.alloc(4); payload.writeUInt32BE(size); return rtmpMessage(5, 0, payload, 0, 2); }
export function setPeerBandwidth(size = 2500000): Buffer { const payload = Buffer.alloc(5); payload.writeUInt32BE(size); payload[4] = 2; return rtmpMessage(6, 0, payload, 0, 2); }
export function setChunkSize(size: number): Buffer { const payload = Buffer.alloc(4); payload.writeUInt32BE(size); return rtmpMessage(1, 0, payload, 0, 2); }
