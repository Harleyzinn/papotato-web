import React, { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  PreJoin,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react';

import { Headphones, X } from 'lucide-react';
import VideoConference from './CallView.jsx';
import '@livekit/components-styles';
function CallStatus() {
  const state = useConnectionState();
  const room = useRoomContext();
  const [deaf, setDeaf] = useState(false);
  useEffect(() => {
    for (const p of room.remoteParticipants.values()) p.setVolume(deaf ? 0 : 1);
    const apply = (p) => p.setVolume(deaf ? 0 : 1);
    room.on('participantConnected', apply);
    return () => room.off('participantConnected', apply);
  }, [deaf, room]);
  return (
    <div className="call-status">
      <span className="status-dot" />
      {{
        connected: 'Conectado',
        connecting: 'Conectando…',
        reconnecting: 'Reconectando…',
        disconnected: 'Desconectado',
        signalReconnecting: 'Reconectando sinal…',
      }[state] || state}
      <button onClick={() => setDeaf(!deaf)}>
        <Headphones size={15} />
        {deaf ? 'Ouvir chamada' : 'Silenciar reprodução'}
      </button>
    </div>
  );
}

export default function MediaUI({
  prejoin,
  setPrejoin,
  user,
  startCall,
  report,
  call,
  callMin,
  setCallMin,
  setCall,
  Modal,
  IconButton,
}) {
  return (
    <>
      {' '}
      {prejoin && (
        <Modal title={'Entrar em ' + prejoin.name} onClose={() => setPrejoin(null)}>
          <p>
            Teste seu microfone e câmera. Os dispositivos só serão acessados ao ativar os controles
            abaixo.
          </p>
          <PreJoin
            defaults={{ username: user.display, audioEnabled: false, videoEnabled: false }}
            persistUserChoices={false}
            onSubmit={startCall}
            onError={(e) =>
              report(new Error('Não foi possível acessar o dispositivo: ' + e.message))
            }
            joinLabel="Entrar na chamada"
            micLabel="Microfone"
            camLabel="Câmera"
            userLabel="Seu nome"
          />
          <p className="muted">
            Compartilhar áudio depende do navegador e da superfície escolhida. No Chrome/Edge, uma
            aba costuma oferecer a opção “Compartilhar áudio”.
          </p>
        </Modal>
      )}
      {call && (
        <section
          className={'call-window ' + (callMin ? 'minimized' : '')}
          aria-label="Chamada ativa"
        >
          <div className="call-window-header">
            <div>
              <span className="status-dot" />
              <strong>{call.channel.name}</strong>
              <small>
                Até {call.limits?.participantsPerCall || 4} pessoas · transporte criptografado
              </small>
            </div>
            <button onClick={() => setCallMin(!callMin)}>
              {callMin ? 'Ampliar chamada' : 'Minimizar'}
            </button>
            <IconButton label="Sair da chamada" onClick={() => setCall(null)}>
              <X size={19} />
            </IconButton>
          </div>
          <LiveKitRoom
            token={call.token}
            serverUrl={call.url}
            connect
            audio={call.choices.audioEnabled ? { deviceId: call.choices.audioDeviceId } : false}
            video={call.choices.videoEnabled ? { deviceId: call.choices.videoDeviceId } : false}
            options={{
              adaptiveStream: true,
              dynacast: true,
              videoCaptureDefaults: {
                resolution: {
                  width: 854,
                  height: call.limits?.cameraHeight || 480,
                  frameRate: call.limits?.cameraFrameRate || 15,
                },
              },
              publishDefaults: {
                simulcast: true,
                videoEncoding: {
                  maxBitrate: call.limits?.cameraBitrate || 500000,
                  maxFramerate: call.limits?.cameraFrameRate || 15,
                },
                screenShareEncoding: {
                  maxBitrate: call.limits?.screenBitrate || 900000,
                  maxFramerate: call.limits?.screenFrameRate || 10,
                },
              },
            }}
            onDisconnected={() => setCall(null)}
            onError={(e) => report(new Error('Falha na chamada: ' + e.message))}
            onMediaDeviceFailure={(failure) =>
              report(
                new Error(
                  'Dispositivo indisponível: ' +
                    failure +
                    '. Verifique permissões e se outro programa está usando a câmera ou o microfone.',
                ),
              )
            }
            data-lk-theme="default"
          >
            <CallStatus />
            <VideoConference limits={call.limits} />
          </LiveKitRoom>
        </section>
      )}
    </>
  );
}
