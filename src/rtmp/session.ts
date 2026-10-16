import { randomBytes } from 'node:crypto';
import type { Socket } from 'node:net';
import { Buffer } from 'node:buffer';
import { decodeAmf0 } from './amf0.js';
import { RtmpChunkParser, type RtmpMessage } from './chunk-parser.js';
import { command, rtmpMessage, setChunkSize, setPeerBandwidth, windowAcknowledgement } from './wire.js';
import { ForwarderSet } from '../services/forwarder.js';
import type { StreamDatabase } from '../db/database.js';

type State = 'handshake' | 'connected' | 'publishing' | 'closed';
export class RtmpSession {
  // State machine: handshake -> connected -> publishing. Any socket error,
  // deleteStream, or disconnect tears down the forwarders and returns safely.
  private state: State = 'handshake'; private handshake = Buffer.alloc(0); private readonly parser = new RtmpChunkParser(); private streamId = 1; private forwarders?: ForwarderSet; private bytesIn = 0; private publishedName?: string;
  constructor(private readonly socket: Socket, private readonly db: StreamDatabase) { socket.on('data', (data) => this.receive(data)); socket.on('close', () => this.close()); socket.on('error', (error) => console.warn('RTMP socket error', error.message)); }
  private receive(data: Buffer): void { if (this.state === 'closed') return; this.bytesIn += data.length; try { if (this.state === 'handshake') { this.consumeHandshake(data); return; } for (const message of this.parser.push(data)) this.handleMessage(message); } catch (error) { console.warn('RTMP protocol error', error); this.socket.destroy(); } }
  private consumeHandshake(data: Buffer): void {
    this.handshake = Buffer.concat([this.handshake, data]);
    if (this.handshake.length < 1537) return;
    if (this.handshake[0] !== 3) throw new Error('Only RTMP version 3 is supported');
    const c1 = this.handshake.subarray(1, 1537); const response = Buffer.concat([Buffer.from([3]), Buffer.alloc(1536), c1]); randomBytes(1528).copy(response, 9); this.socket.write(response);
    this.handshake = this.handshake.subarray(1537); this.state = 'connected'; if (this.handshake.length) for (const message of this.parser.push(this.handshake)) this.handleMessage(message);
  }
  private handleMessage(message: RtmpMessage): void {
    if (message.typeId === 1) { if (message.payload.length >= 4) this.parser.setChunkSize(message.payload.readUInt32BE()); return; }
    if (message.typeId === 4) return; // user-control events are acknowledged by the TCP lifecycle.
    if (message.typeId === 20) this.handleCommand(message);
    else if (this.state === 'publishing' && (message.typeId === 8 || message.typeId === 9 || message.typeId === 18)) this.forwarders?.write(this.toFlvTag(message));
  }
  private handleCommand(message: RtmpMessage): void {
    const values = decodeAmf0(message.payload); const name = values[0]; if (typeof name !== 'string') return;
    if (name === 'connect') { this.socket.write(Buffer.concat([windowAcknowledgement(), setPeerBandwidth(), setChunkSize(4096), command('_result', 0, [1, 0, { fmsVer: 'FMS/3,5,7', capabilities: 31 }, { level: 'status', code: 'NetConnection.Connect.Success', description: 'Connection succeeded.' }])])); return; }
    if (name === 'createStream') { this.socket.write(command('_result', 0, [values[1] as number, null, this.streamId])); return; }
    if (name === 'publish') { this.startPublish(message, values); return; }
    if (name === 'deleteStream' || name === 'closeStream' || name === 'FCUnpublish') { this.stopPublish(); return; }
  }
  private startPublish(message: RtmpMessage, values: ReturnType<typeof decodeAmf0>): void {
    const streamName = typeof values[3] === 'string' ? values[3] : ''; const destinations = this.db.getEnabledDestinations(); if (!streamName || destinations.length === 0) { this.socket.write(command('onStatus', message.messageStreamId, [null, { level: 'error', code: 'NetStream.Publish.Rejected', description: 'No stream name or enabled destinations.' }])); return; }
    this.publishedName = streamName; this.forwarders = new ForwarderSet(destinations); this.forwarders.start(); this.state = 'publishing'; this.socket.write(command('onStatus', message.messageStreamId, [null, { level: 'status', code: 'NetStream.Publish.Start', description: `Publishing ${streamName}` }]));
  }
  private stopPublish(): void { this.forwarders?.stop(); this.forwarders = undefined; if (this.state === 'publishing') this.state = 'connected'; this.publishedName = undefined; }
  private toFlvTag(message: RtmpMessage): Buffer { const tag = Buffer.alloc(11); tag[0] = message.typeId; tag.writeUIntBE(message.payload.length, 1, 3); tag.writeUIntLE(message.timestamp & 0xffffff, 4, 3); tag[7] = (message.timestamp >>> 24) & 0xff; tag.writeUIntBE(message.messageStreamId, 8, 3); const size = Buffer.alloc(4); size.writeUInt32BE(message.payload.length + 11); return Buffer.concat([tag, message.payload, size]); }
  private close(): void { if (this.state === 'closed') return; this.stopPublish(); this.state = 'closed'; }
  destroy(): void { this.stopPublish(); this.socket.destroy(); this.state = 'closed'; }
  get status(): { state: State; streamName?: string; bytesIn: number; forwarders: number } { return { state: this.state, streamName: this.publishedName, bytesIn: this.bytesIn, forwarders: this.forwarders?.count ?? 0 }; }
}
