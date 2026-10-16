import { ChildProcess, spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import { config } from '../config.js';
import type { Destination } from '../db/database.js';

export class FfmpegForwarder {
  private child?: ChildProcess;
  private failed = false;
  constructor(private readonly destination: Destination, private readonly onExit: (name: string, code: number | null) => void) {}
  get name(): string { return this.destination.name; }
  start(): void {
    const output = `${this.destination.rtmpUrl.replace(/\/$/, '')}/${this.destination.streamKey}`;
    this.child = spawn(config.ffmpegPath, ['-hide_banner', '-loglevel', 'warning', '-f', 'flv', '-i', 'pipe:0', '-c', 'copy', '-f', 'flv', output], { stdio: ['pipe', 'ignore', 'pipe'] });
    this.child.stderr?.setEncoding('utf8');
    this.child.stderr?.on('data', (line: string) => console.warn(`[ffmpeg:${this.name}] ${line.trim()}`));
    this.child.once('error', (error) => { this.failed = true; console.error(`[ffmpeg:${this.name}] spawn failed`, error); });
    this.child.once('exit', (code) => { if (!this.failed) this.onExit(this.name, code); });
  }
  write(tag: Buffer): void { const input = this.child?.stdin as Writable | undefined; if (!input || input.destroyed) return; if (!input.write(tag)) input.once('drain', () => undefined); }
  stop(): void { if (this.child && !this.child.killed) this.child.kill('SIGTERM'); }
}

export class ForwarderSet {
  private readonly forwarders: FfmpegForwarder[];
  constructor(destinations: Destination[]) { this.forwarders = destinations.map((d) => new FfmpegForwarder(d, (name, code) => console.warn(`Forwarder ${name} exited with ${code}`))); }
  start(): void { for (const forwarder of this.forwarders) { forwarder.start(); forwarder.write(Buffer.from([0x46, 0x4c, 0x56, 0x01, 0x05, 0, 0, 0, 9, 0, 0, 0, 0])); } }
  write(tag: Buffer): void { for (const forwarder of this.forwarders) forwarder.write(tag); }
  stop(): void { for (const forwarder of this.forwarders) forwarder.stop(); }
  get count(): number { return this.forwarders.length; }
}
