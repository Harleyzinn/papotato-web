// Real SFU transport test with generated media. Does not access any physical device.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import {
  Room,
  RoomEvent,
  AudioSource,
  AudioFrame,
  LocalAudioTrack,
  VideoSource,
  VideoFrame,
  LocalVideoTrack,
  VideoBufferType,
  VideoStream,
  AudioStream,
  TrackPublishOptions,
  TrackSource,
  dispose,
} from '@livekit/rtc-node';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createApp } from '../server/app.js';
const directory = mkdtempSync(join(tmpdir(), 'roda-media-'));
const { app, db } = createApp({ directory });
const rooms = [new Room(), new Room()];
const resources = [];
const readers = [];
let channel;
const received = {};
let error;
const timeout = setTimeout(() => {
  console.error('MEDIA_TIMEOUT');
  process.exit(1);
}, 45000);
try {
  const agents = [request.agent(app), request.agent(app)];
  for (let i = 0; i < 2; i++)
    await agents[i]
      .post('/api/auth/register')
      .send({
        email: `media${i}@example.com`,
        username: `media${i}`,
        display: `Media ${i}`,
        password: 'teste-media-sintetica-123',
      })
      .expect(200);
  const sid = (await agents[0].post('/api/spaces').send({ name: 'Teste de mídia' }).expect(200))
    .body.id;
  const invite = (
    await agents[0]
      .post('/api/spaces/' + sid + '/invites')
      .send({})
      .expect(200)
  ).body;
  await agents[1].post('/api/invites/' + invite.code + '/join').expect(200);
  channel = (await agents[0].get('/api/spaces/' + sid + '/channels')).body.find(
    (c) => c.kind === 'voice',
  ).id;
  for (let i = 0; i < 2; i++) {
    rooms[i].on(RoomEvent.TrackSubscribed, (track, pub) => {
      const label = i + ':' + pub.source;
      received[label] = { frames: 0, nonzero: 0 };
      const stream =
        pub.source === TrackSource.SOURCE_MICROPHONE
          ? new AudioStream(track)
          : new VideoStream(track);
      const reader = stream.getReader();
      readers.push(reader);
      (async () => {
        try {
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            received[label].frames++;
            if (
              pub.source === TrackSource.SOURCE_MICROPHONE &&
              item.value.data.some((x) => Math.abs(x) > 100)
            )
              received[label].nonzero++;
          }
        } catch {}
      })();
    });
    const { url, token } = (await agents[i].post('/api/channels/' + channel + '/token').expect(200))
      .body;
    await rooms[i].connect(url, token, { autoSubscribe: true });
  }
  const service = new RoomServiceClient(
    process.env.LIVEKIT_URL.replace(/^ws/, 'http'),
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
  const configuredRoom = (await service.listRooms([channel]))[0];
  assert.equal(
    configuredRoom.maxParticipants,
    4,
    'A SFU deve impor o limite gratuito de quatro pessoas.',
  );
  const audioSources = [];
  const videoSources = [];
  for (let i = 0; i < 2; i++) {
    const audio = new AudioSource(48000, 1);
    resources.push(audio);
    audioSources.push(audio);
    const track = LocalAudioTrack.createAudioTrack('microfone-sintetico', audio);
    resources.push(track);
    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    await rooms[i].localParticipant.publishTrack(track, options);
    for (const source of [TrackSource.SOURCE_CAMERA, TrackSource.SOURCE_SCREENSHARE]) {
      const video = new VideoSource(320, 180);
      resources.push(video);
      videoSources.push(video);
      const vt = LocalVideoTrack.createVideoTrack('video-sintetico-' + source, video);
      resources.push(vt);
      const opts = new TrackPublishOptions();
      opts.source = source;
      await rooms[i].localParticipant.publishTrack(vt, opts);
    }
  }
  for (let frame = 0; frame < 180; frame++) {
    const pcm = new Int16Array(480);
    for (let j = 0; j < 480; j++)
      pcm[j] = Math.round(9000 * Math.sin((2 * Math.PI * 440 * (frame * 480 + j)) / 48000));
    await Promise.all(audioSources.map((a) => a.captureFrame(new AudioFrame(pcm, 48000, 1, 480))));
    if (frame % 3 === 0) {
      const pixels = new Uint8Array(320 * 180 * 4);
      for (let p = 0; p < pixels.length; p += 4) {
        pixels[p] = frame;
        pixels[p + 1] = 180;
        pixels[p + 2] = 80;
        pixels[p + 3] = 255;
      }
      for (const v of videoSources)
        v.captureFrame(new VideoFrame(pixels, 320, 180, VideoBufferType.RGBA));
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 2; i++)
    for (const source of [
      TrackSource.SOURCE_MICROPHONE,
      TrackSource.SOURCE_CAMERA,
      TrackSource.SOURCE_SCREENSHARE,
    ]) {
      const r = received[i + ':' + source];
      assert(r?.frames > 0, `Sem frames: sessão ${i}, fonte ${source}`);
      if (source === TrackSource.SOURCE_MICROPHONE)
        assert(r.nonzero > 0, 'Áudio recebido contém apenas silêncio.');
    }
  console.log(
    'MEDIA_PASS: duas sessões independentes receberam áudio não silencioso, vídeo e tela simultaneamente pela SFU local.',
    JSON.stringify(received),
  );
} catch (e) {
  error = e;
  console.error(e.message);
} finally {
  for (const reader of readers) await reader.cancel().catch(() => {});
  for (const room of rooms) await room.disconnect().catch(() => {});
  for (const resource of resources.reverse()) await resource.close?.().catch(() => {});
  if (channel) {
    const service = new RoomServiceClient(
      process.env.LIVEKIT_URL.replace(/^ws/, 'http'),
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    await service.deleteRoom(channel).catch(() => {});
  }
  await dispose();
  db.close();
  rmSync(directory, { recursive: true, force: true });
  clearTimeout(timeout);
}
if (error) process.exitCode = 1;
