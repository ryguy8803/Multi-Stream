import { Buffer } from 'node:buffer';

export interface RtmpMessage { chunkStreamId: number; timestamp: number; typeId: number; messageStreamId: number; payload: Buffer; }
interface Header { timestamp: number; timestampDelta: number; typeId: number; messageLength: number; messageStreamId: number; extended: boolean; }
interface State { header?: Header; received: number; chunks: Buffer[]; }

export class RtmpChunkParser {
  private input = Buffer.alloc(0);
  private readonly states = new Map<number, State>();
  private chunkSize = 128;

  push(data: Buffer): RtmpMessage[] {
    // TCP does not preserve RTMP chunk boundaries. Keep a rolling buffer and
    // remove bytes only after a complete header and payload chunk are present.
    this.input = Buffer.concat([this.input, data]);
    if (this.input.length > 64 * 1024 * 1024) throw new Error('RTMP input buffer exceeded 64 MiB');
    const output: RtmpMessage[] = [];
    while (true) {
      const start = this.input.length; if (start < 1) break;
      const basic = this.input[0]; const format = basic >> 6; let csid = basic & 0x3f; let offset = 1;
      if (csid === 0) { if (start < 2) break; csid = this.input[1] + 64; offset = 2; }
      else if (csid === 1) { if (start < 3) break; csid = this.input[1] + this.input[2] * 256 + 64; offset = 3; }
      let state = this.states.get(csid) ?? { received: 0, chunks: [] };
      let header = state.header;
      const headerBytes = format === 0 ? 11 : format === 1 ? 7 : format === 2 ? 3 : 0;
      if (start < offset + headerBytes) break;
      let timestamp = 0; let delta = 0;
      if (format === 0) { timestamp = this.input.readUIntBE(offset, 3); const length = this.input.readUIntBE(offset + 3, 3); const typeId = this.input[offset + 6]; const streamId = this.input.readUInt32LE(offset + 7); header = { timestamp, timestampDelta: 0, typeId, messageLength: length, messageStreamId: streamId, extended: timestamp === 0xffffff }; delta = 0; }
      else if (!header) throw new Error(`RTMP fmt ${format} has no previous header for CSID ${csid}`);
      else if (format === 1) { delta = this.input.readUIntBE(offset, 3); const length = this.input.readUIntBE(offset + 3, 3); const typeId = this.input[offset + 6]; header = { ...header, timestamp: header.timestamp + delta, timestampDelta: delta, typeId, messageLength: length }; }
      else if (format === 2) { delta = this.input.readUIntBE(offset, 3); header = { ...header, timestamp: header.timestamp + delta, timestampDelta: delta }; }
      else { delta = header.timestampDelta; header = { ...header, timestamp: header.timestamp + delta }; }
      if (header.messageLength > 64 * 1024 * 1024) throw new Error('RTMP message exceeds 64 MiB');
      let consumed = offset + headerBytes; if (header.extended || (format < 3 && (format === 0 ? timestamp : delta) === 0xffffff)) { if (start < consumed + 4) break; const extended = this.input.readUInt32BE(consumed); consumed += 4; header = { ...header, timestamp: format === 0 ? extended : header.timestamp + extended, extended: true }; }
      const remaining = header.messageLength - state.received; const take = Math.min(this.chunkSize, remaining); if (start < consumed + take) break;
      state = { header, received: state.received + take, chunks: [...state.chunks, this.input.subarray(consumed, consumed + take)] }; this.input = this.input.subarray(consumed + take);
      if (state.received === header.messageLength) { output.push({ chunkStreamId: csid, timestamp: header.timestamp, typeId: header.typeId, messageStreamId: header.messageStreamId, payload: Buffer.concat(state.chunks) }); state = { header, received: 0, chunks: [] }; }
      this.states.set(csid, state);
    }
    return output;
  }
  setChunkSize(size: number): void { if (size > 0 && size < 16 * 1024 * 1024) this.chunkSize = size; }
}
