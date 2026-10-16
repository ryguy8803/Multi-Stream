# Multistream RTMP Server

A native Node.js/TypeScript RTMP ingest server for OBS-style publishers. It performs the RTMP handshake and basic command flow, converts encoded RTMP media messages into an FLV pipe, and launches one supervised FFmpeg process per enabled destination. FFmpeg uses `-c copy`, so audio/video are not re-encoded.

## Build and run

Steps to build and/or run the software:

1. Install Node.js 20+ and FFmpeg, then run `npm install`.
2. Copy `.env.example` to `.env` and run `npm run init-db`.
3. Add destinations with `POST /stream/config`, or edit the SQLite database. Never commit stream keys.
4. Run `npm run build && npm start` and point OBS at `rtmp://127.0.0.1:1935/live` with any stream name.

## API

To recreate the development environment, you need the following software and/or libraries with the specified versions:

* `GET /status` reports active RTMP sessions and destination names without exposing keys.
* `GET /stream/config` lists configured destinations without exposing keys.
* `POST /stream/config` accepts `{ "name", "platform", "rtmpUrl", "streamKey", "enabled" }`.

## Implementation notes

I found these websites useful in developing this software:

The RTMP parser supports the common RTMP chunk header forms, extended timestamps, control messages, AMF0 `connect`/`createStream`/`publish`/`deleteStream`, and concurrent sessions. Media messages are rebuilt as FLV tags because FFmpeg's `-f flv -i pipe:0` expects FLV, not raw RTMP chunks.

This is intentionally a compact baseline rather than a complete RTMP server: it does not implement RTMPE, AMF3, authentication, TLS, replay protection, or a full RTMP feature matrix. Put it behind an authenticated local/private network boundary before exposing the HTTP config endpoint.
*

## Future Work

The following items I plan to fix, improve, and/or add to this project in the future:

* [ ] Works good, I would like to optomize this program to take less load of the CPU 
* [ ]
* [ ]
