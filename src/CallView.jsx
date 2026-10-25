import React, { useEffect, useRef, useState } from 'react';
import {
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  MediaDeviceMenu,
  useTracks,
  useRoomContext,
  useParticipants,
  StartAudio,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
export default function CallView() {
  const room = useRoomContext(),
    participants = useParticipants(),
    tracks = useTracks([
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ]);
  const [focused, setFocused] = useState(''),
    [quality, setQuality] = useState('720'),
    [error, setError] = useState(''),
    [stats, setStats] = useState({}),
    [screen, setScreen] = useState(false);
  const area = useRef();
  const key = (t) => t.participant.identity + ':' + t.source;
  const focus = tracks.find((t) => key(t) === focused);
  useEffect(() => {
    const update = () => setScreen(room.localParticipant.isScreenShareEnabled);
    room.on('localTrackPublished', update);
    room.on('localTrackUnpublished', update);
    return () => {
      room.off('localTrackPublished', update);
      room.off('localTrackUnpublished', update);
    };
  }, [room]);
  useEffect(() => {
    const interval = setInterval(async () => {
      let packets = 0,
        lost = 0,
        jitter = 0;
      for (const p of room.remoteParticipants.values())
        for (const pub of p.trackPublications.values()) {
          const report = await pub.track?.getRTCStatsReport?.().catch(() => undefined);
          report?.forEach((s) => {
            if (s.type === 'inbound-rtp') {
              packets += s.packetsReceived || 0;
              lost += Math.max(0, s.packetsLost || 0);
              jitter = Math.max(jitter, s.jitter || 0);
            }
          });
        }
      setStats({
        loss: packets ? ((lost / (packets + lost)) * 100).toFixed(1) : '—',
        jitter: packets ? Math.round(jitter * 1000) : '—',
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [room]);
  return (
    <div className="roda-call-view">
      <RoomAudioRenderer />
      <StartAudio label="Ativar áudio da chamada" />
      {screen && (
        <div className="sharing-notice">
          Sua tela está sendo compartilhada. Use “Tela” para encerrar.
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError('')}>Fechar</button>
        </div>
      )}
      <div className="media-area" ref={area}>
        {focus ? (
          <div className="focused-track">
            <ParticipantTile trackRef={focus} />
            <button onClick={() => setFocused('')}>Voltar à grade</button>
          </div>
        ) : (
          <GridLayout tracks={tracks}>
            <ParticipantTile
              onParticipantClick={(e) =>
                setFocused(e.participant.identity + ':' + (e.track?.source || Track.Source.Camera))
              }
            />
          </GridLayout>
        )}
      </div>
      <div className="media-toolbar">
        <TrackToggle
          source={Track.Source.Microphone}
          onDeviceError={(e) => setError('Microfone: ' + e.message)}
        >
          Microfone
        </TrackToggle>
        <MediaDeviceMenu
          kind="audioinput"
          requestPermissions={false}
          aria-label="Escolher microfone"
        >
          ⌄
        </MediaDeviceMenu>
        <TrackToggle
          source={Track.Source.Camera}
          onDeviceError={(e) => setError('Câmera: ' + e.message)}
        >
          Câmera
        </TrackToggle>
        <MediaDeviceMenu kind="videoinput" requestPermissions={false} aria-label="Escolher câmera">
          ⌄
        </MediaDeviceMenu>
        <TrackToggle
          source={Track.Source.ScreenShare}
          captureOptions={{
            audio: true,
            resolution: {
              width: quality === '1080' ? 1920 : quality === '720' ? 1280 : 854,
              height: Number(quality),
              frameRate: 15,
            },
          }}
          onDeviceError={(e) => setError('Não foi possível compartilhar: ' + e.message)}
        >
          Tela
        </TrackToggle>
        <select
          aria-label="Qualidade de tela na próxima transmissão"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          disabled={screen}
        >
          <option value="480">Tela 480p</option>
          <option value="720">Tela 720p</option>
          <option value="1080">Tela 1080p</option>
        </select>
        <button
          className="lk-button"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen?.();
            else
              area.current?.requestFullscreen?.().catch(() => setError('Tela cheia indisponível.'));
          }}
        >
          Tela cheia
        </button>
        <button className="lk-button leave" onClick={() => room.disconnect()}>
          Sair
        </button>
      </div>
      <details className="call-diagnostics">
        <summary>
          Dispositivos, volume e conexão · perda {stats.loss}% · jitter {stats.jitter} ms
        </summary>
        <p>
          A qualidade é adaptativa. Clique em uma pessoa ou tela para ampliar. O áudio de tela
          depende do navegador e da superfície selecionada.
        </p>
        <div className="audio-output">
          <span>Saída de áudio</span>
          <MediaDeviceMenu kind="audiooutput" requestPermissions={false}>
            Escolher saída (se suportado)
          </MediaDeviceMenu>
        </div>
        {participants
          .filter((p) => !p.isLocal)
          .map((p) => (
            <label className="participant-volume" key={p.identity}>
              {p.name || p.identity} ·{' '}
              {{
                excellent: 'ótima',
                good: 'boa',
                poor: 'fraca',
                lost: 'sem sinal',
                unknown: 'avaliando',
              }[p.connectionQuality] || p.connectionQuality}
              <input
                type="range"
                min="0"
                max="100"
                defaultValue="100"
                onChange={(e) => p.setVolume(Number(e.target.value) / 100)}
              />
            </label>
          ))}
      </details>
    </div>
  );
}
