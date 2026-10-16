import { Buffer } from 'node:buffer';

export type AmfValue = string | number | boolean | null | undefined | AmfValue[] | Record<string, AmfValue>;

export function decodeAmf0(buffer: Buffer): AmfValue[] {
  const values: AmfValue[] = [];
  let offset = 0;
  const read = (): AmfValue => {
    const type = buffer[offset++];
    if (type === 0x02) { const length = buffer.readUInt16BE(offset); offset += 2; const value = buffer.toString('utf8', offset, offset + length); offset += length; return value; }
    if (type === 0x00) { const value = buffer.readDoubleBE(offset); offset += 8; return value; }
    if (type === 0x01) return buffer[offset++] !== 0;
    if (type === 0x05 || type === 0x06) return null;
    if (type === 0x03) { const object: Record<string, AmfValue> = {}; while (offset + 3 <= buffer.length) { const length = buffer.readUInt16BE(offset); offset += 2; if (length === 0 && buffer[offset] === 0x09) { offset++; break; } const key = buffer.toString('utf8', offset, offset + length); offset += length; object[key] = read(); } return object; }
    if (type === 0x08) { const count = buffer.readUInt32BE(offset); offset += 4; const object: Record<string, AmfValue> = {}; for (let i = 0; i < count && offset < buffer.length; i++) { const length = buffer.readUInt16BE(offset); offset += 2; const key = buffer.toString('utf8', offset, offset + length); offset += length; object[key] = read(); } return object; }
    throw new Error(`Unsupported AMF0 type 0x${type.toString(16)}`);
  };
  while (offset < buffer.length) values.push(read());
  return values;
}

function string(value: string): Buffer { const body = Buffer.from(value); const out = Buffer.alloc(3 + body.length); out[0] = 0x02; out.writeUInt16BE(body.length, 1); body.copy(out, 3); return out; }
function number(value: number): Buffer { const out = Buffer.alloc(9); out[0] = 0; out.writeDoubleBE(value, 1); return out; }
function object(value: Record<string, AmfValue>): Buffer { const chunks: Buffer[] = [Buffer.from([0x03])]; for (const [key, item] of Object.entries(value)) { const keyBuffer = Buffer.from(key); chunks.push(Buffer.from([keyBuffer.length >> 8, keyBuffer.length & 255]), keyBuffer, encodeAmf0Value(item)); } chunks.push(Buffer.from([0, 0, 9])); return Buffer.concat(chunks); }
export function encodeAmf0Value(value: AmfValue): Buffer { if (typeof value === 'string') return string(value); if (typeof value === 'number') return number(value); if (typeof value === 'boolean') return Buffer.from([1, value ? 1 : 0]); if (value === null || value === undefined) return Buffer.from([5]); if (Array.isArray(value)) return Buffer.concat([Buffer.from([8, 0, 0, 0, value.length]), ...value.map(encodeAmf0Value)]); return object(value); }
export function encodeAmf0(...values: AmfValue[]): Buffer { return Buffer.concat(values.map(encodeAmf0Value)); }
