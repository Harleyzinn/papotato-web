import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  api,
  API_BASE,
  APP_BASE,
  asset,
  clearToken,
  getToken,
  IS_DESKTOP,
  createRealtime,
} from './client.js';
import DesktopGate, { DesktopInfo } from './DesktopGate.jsx';
import DesktopHosting from './DesktopHosting.jsx';
import ServiceGate from './ServiceGate.jsx';
import UsagePanel from './UsagePanel.jsx';
const MediaUI = lazy(() => import('./MediaUI.jsx'));
import { createRoot } from 'react-dom/client';

import Markdown from 'react-markdown';
import Extras, {
  UploadButton,
  DirectButton,
  AttachmentLink,
  GroupCreator,
  AttachmentImage,
} from './Extras.jsx';
import {
  Plus,
  Hash,
  Volume2,
  Settings,
  Users,
  Search,
  Send,
  ArrowRight,
  X,
  LogOut,
  Copy,
  Phone,
  Headphones,
  MessageCircle,
  ChevronDown,
  Menu,
  Pin,
  Reply,
  Smile,
  Pencil,
  Trash2,
  Check,
  Shield,
  Link,
  Sparkles,
} from 'lucide-react';
import './style.css';

const IconButton = ({ label, children, ...props }) => (
  <button className="icon" aria-label={label} title={label} {...props}>
    {children}
  </button>
);
const Avatar = ({ name = '', large = false }) => (
  <span
    className={'avatar ' + (large ? 'large' : '')}
    style={{ '--hue': Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % 360 }}
  >
    {name.slice(0, 2).toUpperCase()}
  </span>
);
function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const close = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    d.addEventListener('keydown', close);
    return () => d.removeEventListener('keydown', close);
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton label="Fechar" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function Auth({ onLogin }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const b = Object.fromEntries(new FormData(e.target));
    try {
      onLogin(await api('/auth/' + (register ? 'register' : 'login'), 'POST', b));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-story">
        <a className="brand" href={APP_BASE}>
          <img src={asset('logo.svg')} alt="" />
          papotato<span>JUNTO É MELHOR</span>
        </a>
        <div className="story-content">
          <span className="eyebrow">
            <span className="status-dot" /> PAPO BOM, COMPANHIA MELHOR
          </span>
          <h1>
            O papo tá servido.
            <br />
            Pode chegar junto.
          </h1>
          <p>
            Uma conversa que vira madrugada.
            <br />
            Uma partida que vira história.
            <br />
            Sua turma, na mesma roda.
          </p>
          <div className="orbit">
            <div className="orbit-circle c1" />
            <div className="orbit-circle c2" />
            <div className="orbit-circle c3" />
            <img src={asset('logo.svg')} alt="Símbolo Papotato" />
            <span className="orbit-note n1">
              <Headphones size={19} /> Só mais uma partida?
            </span>
            <span className="orbit-note n2">
              <Volume2 size={18} /> Chega mais.
            </span>
          </div>
        </div>
        <small>Texto, voz, vídeo e tela. Do seu jeito.</small>
      </div>
      <section className="auth-card">
        <span className="eyebrow">BOM TER VOCÊ POR AQUI</span>
        <h2>{register ? 'Seu papo começa aqui.' : 'Pode chegar.'}</h2>
        <p>
          {register
            ? 'Crie sua conta e convide quem faz parte.'
            : 'Entre para continuar a conversa.'}
        </p>
        <form onSubmit={submit}>
          {register && (
            <>
              <label>
                Como quer ser chamado?
                <input
                  name="display"
                  required
                  maxLength={60}
                  autoComplete="nickname"
                  placeholder="Seu nome"
                />
              </label>
              <label>
                Nome de usuário
                <input
                  name="username"
                  required
                  pattern="[a-z0-9_]{3,24}"
                  placeholder="seu_usuario"
                  autoComplete="username"
                />
                <small>3–24 letras minúsculas, números ou _</small>
              </label>
            </>
          )}
          <label>
            E-mail
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="voce@exemplo.com"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              required
              minLength={register ? 12 : 1}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder={register ? 'Pelo menos 12 caracteres' : 'Sua senha'}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Só um instante…' : register ? 'Criar minha conta' : 'Entrar no Papotato'}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Já tem uma conta?' : 'Ainda não tem conta?'}{' '}
          <button
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Entrar' : 'Crie a sua'}
          </button>
        </p>
        <div className="auth-foot">
          <Shield size={16} />
          <span>Sua senha é protegida. Você escolhe com quem conversar.</span>
        </div>
        <small>
          {IS_DESKTOP
            ? 'Contas protegidas pelo Firebase Authentication.'
            : 'Recuperação e verificação de e-mail ainda não disponíveis.'}
        </small>
      </section>
    </main>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [spaces, setSpaces] = useState([]),
    [space, setSpace] = useState(null),
    [channels, setChannels] = useState([]),
    [channel, setChannel] = useState(null),
    [messages, setMessages] = useState([]),
    [members, setMembers] = useState([]),
    [modal, setModal] = useState(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [body, setBody] = useState(''),
    [reply, setReply] = useState(null),
    [typing, setTyping] = useState(''),
    [search, setSearch] = useState(''),
    [friends, setFriends] = useState([]),
    [call, setCall] = useState(null),
    [prejoin, setPrejoin] = useState(null),
    [joiningCall, setJoiningCall] = useState(false),
    [callMin, setCallMin] = useState(false),
    [connected, setConnected] = useState(false),
    [mobile, setMobile] = useState(false),
    [inviteResult, setInviteResult] = useState(''),
    [theme, setTheme] = useState(localStorage.getItem('roda-theme') || 'dark'),
    [density, setDensity] = useState(localStorage.getItem('roda-density') || 'comfortable'),
    [font, setFont] = useState(localStorage.getItem('roda-font') || '16'),
    [notifications, setNotifications] = useState(
      localStorage.getItem('roda-notifications') === 'true',
    );
  const pendingDraft = useRef(null),
    callRequest = useRef(0),
    callPending = useRef(false),
    socket = useRef(null),
    channelRef = useRef(null),
    end = useRef(null),
    composer = useRef(null),
    searchRef = useRef(null),
    typingTimer = useRef(),
    userRef = useRef(null);
  const selected = channels.find((c) => c.id === channel),
    currentSpace = spaces.find((s) => s.id === space),
    canManage = ['owner', 'admin'].includes(currentSpace?.role);
  function report(e) {
    setError(e.message || String(e));
  }
  async function attempt(fn) {
    setError('');
    try {
      return await fn();
    } catch (e) {
      report(e);
    }
  }
  async function refreshSpaces(preferred) {
    const s = await api('/spaces');
    setSpaces(s);
    setSpace((old) => preferred || (s.some((x) => x.id === old) ? old : s[0]?.id || null));
  }
  async function refreshMessages(cid = channelRef.current, q = '') {
    if (!cid) return;
    const data = await api(
      '/channels/' + cid + '/messages' + (q ? '?q=' + encodeURIComponent(q) : ''),
    );
    if (channelRef.current === cid) setMessages(data);
  }
  useEffect(() => {
    api('/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('roda-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem('roda-density', density);
  }, [density]);
  useEffect(() => {
    document.documentElement.style.fontSize = font + 'px';
    localStorage.setItem('roda-font', font);
  }, [font]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    if (!user) return;
    attempt(async () => {
      const code = new URLSearchParams(location.search).get('invite');
      if (code) {
        const joined = await api('/invites/' + encodeURIComponent(code) + '/join', 'POST');
        history.replaceState(null, '', APP_BASE);
        await refreshSpaces(joined.id);
        setNotice('Você entrou na comunidade!');
      } else await refreshSpaces();
    });
    let s,
      disposed = false;
    const realtimeOptions = {
      auth: (callback) => callback({ token: getToken() }),
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    };
    createRealtime(realtimeOptions)
      .then((instance) => {
        if (disposed) {
          instance.disconnect();
          return;
        }
        s = instance;
        socket.current = s;
        s.on('connect', () => {
          setConnected(true);
          if (channelRef.current) {
            s.emit('watch', channelRef.current);
            attempt(() => refreshMessages());
          }
        });
        s.on('disconnect', () => setConnected(false));
        s.on('connect_error', (e) => {
          setConnected(false);
          if (e.message === 'Sessão inválida.') {
            clearToken();
            setCall(null);
            setUser(null);
          }
        });
        s.on('session-revoked', () => {
          clearToken();
          setCall(null);
          setUser(null);
          setSpace(null);
          setChannel(null);
        });
        s.on('message', (m) => {
          if (channelRef.current === m.channel_id) {
            setMessages((old) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
            api('/channels/' + m.channel_id + '/read', 'POST').catch(() => {});
          }
          if (
            document.hidden &&
            m.user_id !== userRef.current?.id &&
            userRef.current?.status !== 'busy' &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            localStorage.getItem('roda-notifications') === 'true'
          )
            new Notification('Nova mensagem no Papotato', {
              body: m.display + ' enviou uma mensagem.',
            });
        });
        s.on('refresh', () => attempt(() => refreshMessages()));
        s.on('typing', (v) => {
          if (v.channel !== channelRef.current) return;
          setTyping(v.display);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(''), 3000);
        });
      })
      .catch(report);
    return () => {
      disposed = true;
      s?.disconnect();
      clearTimeout(typingTimer.current);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!space || !user) return;
    let active = true;
    setChannel(null);
    setChannels([]);
    setMembers([]);
    attempt(async () => {
      const [c, m] = await Promise.all([
        api('/spaces/' + space + '/channels'),
        api('/spaces/' + space + '/members'),
      ]);
      if (!active) return;
      setChannels(c);
      setMembers(m);
      setChannel(c.find((x) => x.kind === 'text')?.id || null);
    });
    return () => {
      active = false;
    };
  }, [space, user?.id]);
  useEffect(() => {
    if (!space || !user) return;
    const timer = setInterval(() => {
      api('/spaces/' + space + '/members')
        .then(setMembers)
        .catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [space, user?.id]);
  useEffect(() => {
    channelRef.current = channel;
    setMessages([]);
    setReply(null);
    setBody(
      channel ? sessionStorage.getItem('papotato-draft:' + user?.id + ':' + channel) || '' : '',
    );
    setSearch('');
    setTyping('');
    if (channel) {
      socket.current?.emit('watch', channel);
      attempt(() => refreshMessages(channel));
      api('/channels/' + channel + '/read', 'POST').catch(() => {});
    }
  }, [channel]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'instant' });
  }, [messages.length]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    function keys(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setMobile(false);
        setReply(null);
      }
    }
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, []);
  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    const cid = channel;
    const previous = pendingDraft.current;
    const draft =
      previous?.cid === cid && previous.body === body && previous.reply_id === (reply?.id || null)
        ? previous
        : { id: crypto.randomUUID(), cid, body, reply_id: reply?.id || null };
    pendingDraft.current = draft;
    await attempt(async () => {
      const m = await api('/channels/' + cid + '/messages', 'POST', draft);
      if (channelRef.current === cid) {
        setMessages((old) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
        setBody('');
        sessionStorage.removeItem('papotato-draft:' + user.id + ':' + cid);
        setReply(null);
        pendingDraft.current = null;
      }
    });
  }
  async function openFriends() {
    await attempt(async () => {
      setFriends(await api('/friends'));
      setModal('friends');
    });
  }
  async function joinCall(c) {
    if (call) {
      setCallMin(false);
      setNotice('Saia da chamada atual antes de entrar em outra.');
      return;
    }
    await attempt(async () => {
      await api('/health').then((h) => {
        if (!h.mediaConfigured)
          throw new Error(
            IS_DESKTOP
              ? 'Configure o emissor LiveKit em Configurações → Conexão Firebase e LiveKit.'
              : 'Configure o LiveKit no .env para iniciar chamadas. Veja o README.',
          );
      });
      setPrejoin(c);
    });
  }
  async function startCall(choices) {
    if (callPending.current || !prejoin) return;
    callPending.current = true;
    setJoiningCall(true);
    const request = ++callRequest.current,
      target = prejoin,
      uid = user.id;
    try {
      await attempt(async () => {
        const config = await api('/channels/' + target.id + '/token', 'POST');
        if (request !== callRequest.current || userRef.current?.id !== uid) return;
        setCall({ ...config, choices, channel: target });
        setPrejoin(null);
        setCallMin(false);
      });
    } finally {
      if (request === callRequest.current) {
        callPending.current = false;
        setJoiningCall(false);
      }
    }
  }
  function cancelPrejoin() {
    callRequest.current++;
    callPending.current = false;
    setJoiningCall(false);
    setPrejoin(null);
  }
  useEffect(() => {
    if (IS_DESKTOP) window.papotatoDesktop.setCallActive(!!call);
  }, [call]);
  async function logout() {
    cancelPrejoin();
    await attempt(async () => {
      await api('/auth/logout', 'POST');
      clearToken();
      setCall(null);
      setUser(null);
      setSpaces([]);
      setSpace(null);
      setChannel(null);
    });
  }
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Copiado!');
    } catch {
      setNotice('Copie o endereço exibido.');
    }
  }
  if (loading)
    return (
      <div className="loading">
        <img src={asset('logo.svg')} alt="" />
        Preparando o papo…
      </div>
    );
  if (!user) return <Auth onLogin={setUser} />;
  return (
    <div className="app-shell">
      {IS_DESKTOP && <DesktopHosting user={user} />}
      <Extras
        space={currentSpace}
        user={user}
        members={members}
        canManage={canManage}
        onError={report}
        onChanged={() =>
          attempt(async () => {
            await refreshSpaces();
            setMembers(await api('/spaces/' + space + '/members'));
          })
        }
      />
      <nav className="rail" aria-label="Comunidades">
        <button
          className="home-logo"
          aria-label="Início"
          onClick={() => {
            setModal('welcome');
          }}
        >
          <img src={asset('logo.svg')} alt="Papotato" />
        </button>
        <div className="rail-divider" />
        {spaces.map((s) => (
          <button
            key={s.id}
            className={'space-icon ' + (space === s.id ? 'active' : '')}
            title={s.name}
            onClick={() => {
              setSpace(s.id);
              setMobile(false);
            }}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <IconButton label="Criar comunidade" onClick={() => setModal('create')}>
          <Plus />
        </IconButton>
        <IconButton label="Entrar por convite" onClick={() => setModal('join')}>
          <Link size={21} />
        </IconButton>
        <span className="rail-spacer" />
        <IconButton label="Amigos" onClick={openFriends}>
          <Users size={21} />
        </IconButton>
        <IconButton label="Configurações" onClick={() => setModal('settings')}>
          <Settings size={21} />
        </IconButton>
      </nav>
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <div className="space-header">
          <div>
            <span className="eyebrow">SUA COMUNIDADE</span>
            <h2>{currentSpace?.name || 'Sua próxima roda'}</h2>
          </div>
          <ChevronDown size={18} />
          <IconButton
            label="Fechar canais"
            className="icon mobile-menu"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </IconButton>
        </div>
        <div className="sidebar-scroll">
          <button className="invite-button" onClick={() => setModal(canManage ? 'invite' : 'join')}>
            <Users size={17} />
            {canManage ? 'Convidar amigos' : 'Entrar por convite'}
            <Plus size={16} />
          </button>
          <div className="channel-heading">
            <span>CONVERSAS</span>
            {canManage && (
              <IconButton label="Criar canal" onClick={() => setModal('channel')}>
                <Plus size={15} />
              </IconButton>
            )}
          </div>
          {channels
            .filter((c) => c.kind === 'text')
            .map((c) => (
              <button
                className={'channel ' + (channel === c.id ? 'selected' : '')}
                key={c.id}
                onClick={() => {
                  setChannel(c.id);
                  setMobile(false);
                }}
              >
                <Hash size={20} />
                <span>{c.name}</span>
                {c.private ? <Shield size={13} /> : null}
                {c.unread > 0 && channel !== c.id ? <b className="badge">{c.unread}</b> : null}
              </button>
            ))}
          <div className="channel-heading">
            <span>JUNTE-SE À VOZ</span>
            <Volume2 size={14} />
          </div>
          {channels
            .filter((c) => c.kind === 'voice')
            .map((c) => (
              <button
                className={'channel voice ' + (call?.channel.id === c.id ? 'selected' : '')}
                key={c.id}
                onClick={() => joinCall(c)}
              >
                <Volume2 size={20} />
                <span>{c.name}</span>
                <span className="join-hint">Entrar</span>
              </button>
            ))}
          {!space && (
            <p className="sidebar-help">Crie uma comunidade ou entre com o convite de um amigo.</p>
          )}
          <div className="sidebar-card">
            <span className="tiny-orbit">✳</span>
            <strong>O melhor lugar é junto.</strong>
            <p>Ligue a câmera, compartilhe uma ideia ou só fique por perto.</p>
          </div>
        </div>
        {call && (
          <button className="active-call" onClick={() => setCallMin(false)}>
            <span className="status-dot" />
            <span>
              Chamada em andamento<small>{call.channel.name}</small>
            </span>
            <Phone size={17} />
          </button>
        )}
        <footer className="user-card">
          <Avatar name={user.display} />
          <button className="user-info" onClick={() => setModal('settings')}>
            <strong>{user.display}</strong>
            <small>
              <span className={'status-dot ' + user.status} />
              {
                {
                  online: 'Disponível',
                  away: 'Ausente',
                  busy: 'Não perturbe',
                  invisible: 'Invisível',
                }[user.status]
              }
            </small>
          </button>
          <IconButton label="Configurações" onClick={() => setModal('settings')}>
            <Settings size={18} />
          </IconButton>
        </footer>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <IconButton
            label="Abrir canais"
            className="icon mobile-menu"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </IconButton>
          <Hash className="muted" size={24} />
          <strong>{selected?.name || 'Bem-vindo ao Papotato'}</strong>
          <span className="topbar-description">
            {currentSpace?.description || 'Seu cantinho para ficar perto.'}
          </span>
          <div className="topbar-actions">
            <span
              className={'connection ' + (connected ? '' : 'offline')}
              title={connected ? 'Mensagens conectadas' : 'Reconectando mensagens'}
            >
              <span className="status-dot" />
              <span>{connected ? 'Ao vivo' : 'Reconectando'}</span>
            </span>
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault();
                attempt(() => refreshMessages(channel, search));
              }}
            >
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Buscar mensagens"
                placeholder="Buscar conversa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!channel}
              />
              <kbd>⌘ K</kbd>
            </form>
            <IconButton label="Ver membros" onClick={() => setModal('members')}>
              <Users size={19} />
            </IconButton>
          </div>
        </header>
        {error && (
          <div className="banner error" role="alert">
            {error}
            <IconButton label="Dispensar erro" onClick={() => setError('')}>
              <X size={17} />
            </IconButton>
          </div>
        )}
        {notice && (
          <div className="banner notice" role="status">
            {notice}
          </div>
        )}
        {!channel ? (
          <section className="empty-home">
            <div className="welcome-art">
              <img src={asset('logo.svg')} alt="" />
              <span>✦</span>
            </div>
            <span className="eyebrow">ESPAÇO PARA SER VOCÊ</span>
            <h1>
              Tem lugar para todo mundo.
              <br />E uma roda para os seus.
            </h1>
            <p>
              Crie um espaço, convide seus amigos e continue
              <br />a conversa por texto, voz ou vídeo.
            </p>
            <div className="button-row">
              <button className="primary" onClick={() => setModal('create')}>
                <Plus size={18} />
                Criar minha comunidade
              </button>
              <button className="secondary" onClick={() => setModal('join')}>
                Tenho um convite
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="feature-row">
              <span>
                <MessageCircle />
                Conversas que ficam
              </span>
              <span>
                <Headphones />
                Voz que aproxima
              </span>
              <span>
                <Sparkles />
                Momentos na mesma tela
              </span>
            </div>
          </section>
        ) : (
          <>
            <div className="messages" aria-label="Histórico de mensagens">
              <div className="channel-welcome">
                <div className="welcome-hash">
                  <Hash size={35} />
                </div>
                <span className="eyebrow">COMECE UMA BOA CONVERSA</span>
                <h1>Esse é o #{selected?.name}.</h1>
                <p>Um espaço para compartilhar o dia, combinar planos e ficar por perto.</p>
                <div className="channel-meta">
                  <span>
                    <Shield size={13} />
                    {selected?.private ? 'Canal privado' : 'Só para membros da comunidade'}
                  </span>
                  <span>
                    <Users size={13} />
                    {members.length} {members.length === 1 ? 'pessoa' : 'pessoas'} na roda
                  </span>
                </div>
              </div>
              {messages.length >= 50 && (
                <button
                  className="load-more"
                  onClick={() =>
                    attempt(async () => {
                      const older = await api(
                        '/channels/' + channel + '/messages?before=' + messages[0].seq,
                      );
                      setMessages((old) => [
                        ...older,
                        ...old.filter((x) => !older.some((y) => x.id === y.id)),
                      ]);
                    })
                  }
                >
                  Carregar mensagens anteriores
                </button>
              )}
              {messages.length > 0 && (
                <div className="date-divider">
                  <span>O começo de mais uma conversa</span>
                </div>
              )}
              {messages.map((m) => (
                <article className="message" key={m.id}>
                  <Avatar name={m.display} />
                  <div className="message-content">
                    <div className="message-heading">
                      <strong>{m.display}</strong>
                      <time dateTime={new Date(m.created).toISOString()}>
                        {new Date(m.created).toLocaleString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: 'short',
                        })}
                      </time>
                      {m.edited && <small>editada</small>}
                      {!!m.pinned && (
                        <span className="pinned">
                          <Pin size={12} />
                          Fixada
                        </span>
                      )}
                    </div>
                    {m.reply_id && (
                      <div className="reply-preview">
                        <Reply size={13} />
                        {messages.find((r) => r.id === m.reply_id)?.body.slice(0, 100) ||
                          'Em resposta a uma mensagem anterior'}
                      </div>
                    )}
                    <div className="markdown">
                      <Markdown components={{ a: AttachmentLink, img: AttachmentImage }}>
                        {m.body}
                      </Markdown>
                    </div>
                    {m.reactions?.length > 0 && (
                      <div className="reactions">
                        {m.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            onClick={() =>
                              attempt(() =>
                                api('/messages/' + m.id + '/reactions', 'POST', { emoji: r.emoji }),
                              )
                            }
                          >
                            {r.emoji} {r.count}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="message-tools">
                    <IconButton
                      label="Mais ações da mensagem"
                      className="icon message-more"
                      onClick={() => setModal({ type: 'actions', message: m })}
                    >
                      •••
                    </IconButton>
                    <IconButton
                      label="Responder"
                      onClick={() => {
                        setReply(m);
                        composer.current?.focus();
                      }}
                    >
                      <Reply size={15} />
                    </IconButton>
                    <IconButton
                      label="Reagir com coração"
                      onClick={() =>
                        attempt(() =>
                          api('/messages/' + m.id + '/reactions', 'POST', { emoji: '💚' }),
                        )
                      }
                    >
                      <Smile size={15} />
                    </IconButton>
                    {canManage && (
                      <IconButton
                        label="Fixar ou desafixar"
                        onClick={() => attempt(() => api('/messages/' + m.id + '/pin', 'POST'))}
                      >
                        <Pin size={15} />
                      </IconButton>
                    )}
                    {m.user_id === user.id && (
                      <IconButton
                        label="Editar"
                        onClick={() => setModal({ type: 'edit', message: m })}
                      >
                        <Pencil size={15} />
                      </IconButton>
                    )}
                    {(m.user_id === user.id || canManage) && (
                      <IconButton
                        label="Excluir"
                        onClick={() => setModal({ type: 'delete', message: m })}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    )}
                  </div>
                </article>
              ))}
              <div ref={end} />
            </div>
            <div className="composer-area">
              {reply && (
                <div className="reply-bar">
                  <Reply size={15} />
                  Respondendo a {reply.display}
                  <IconButton label="Cancelar resposta" onClick={() => setReply(null)}>
                    <X size={15} />
                  </IconButton>
                </div>
              )}
              <form className="composer" onSubmit={send}>
                <UploadButton
                  channel={channel}
                  onError={report}
                  onUploaded={(markdown) => setBody((old) => old + (old ? '\n' : '') + markdown)}
                />
                <textarea
                  ref={composer}
                  rows={1}
                  maxLength={4000}
                  aria-label="Mensagem"
                  placeholder={'Converse em #' + selected?.name}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    sessionStorage.setItem(
                      'papotato-draft:' + user.id + ':' + channel,
                      e.target.value,
                    );
                    socket.current?.emit('typing', channel);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                />
                <button className="send" aria-label="Enviar mensagem" disabled={!body.trim()}>
                  <Send size={18} />
                </button>
              </form>
              <div className="composer-note">
                <span>
                  {typing ? (
                    <>
                      <strong>{typing}</strong> está digitando…
                    </>
                  ) : (
                    'Um oi pode ser o começo de uma boa história.'
                  )}
                </span>
                <span>
                  <kbd>Enter</kbd> enviar · <kbd>Shift + Enter</kbd> nova linha
                </span>
              </div>
            </div>
          </>
        )}
      </main>
      <aside className="members-panel">
        <div className="members-title">
          <span>SUA TURMA</span>
          <span>{members.length}</span>
        </div>
        <span className="eyebrow">POR AQUI</span>
        {members.map((m) => (
          <button
            key={m.id}
            className="member"
            onClick={() => setModal({ type: 'profile', member: m })}
          >
            <span className="avatar-wrap">
              <Avatar name={m.display} />
              <span className={'status-dot ' + (m.connected ? m.status : 'offline')} />
            </span>
            <span>
              <strong>{m.display}</strong>
              <small>
                {m.custom_status ||
                  { owner: 'Dono da roda', admin: 'Administrador', member: 'Membro' }[m.role]}
              </small>
            </span>
            {m.role === 'owner' && <span className="crown">♔</span>}
          </button>
        ))}
        <div className="members-bottom">
          <div className="line-art">◎</div>
          <strong>Sua turma, mais perto.</strong>
          <p>
            Convide alguém para
            <br />
            fazer parte dessa roda.
          </p>
          <button className="text-button" onClick={() => setModal(canManage ? 'invite' : 'join')}>
            Trazer um amigo
            <ArrowRight size={15} />
          </button>
        </div>
      </aside>
      {modal && (
        <Modal
          title={
            typeof modal === 'object'
              ? {
                  edit: 'Editar mensagem',
                  actions: 'Ações da mensagem',
                  delete: 'Excluir mensagem',
                  profile: modal.member?.display,
                }[modal.type]
              : {
                  create: 'Uma nova roda',
                  join: 'Chegue mais',
                  invite: 'Convide sua turma',
                  channel: 'Novo canal',
                  settings: 'Do seu jeito',
                  friends: 'Seus amigos',
                  members: 'Sua turma',
                  welcome: 'Bem-vindo ao Papotato',
                }[modal]
          }
          onClose={() => {
            setModal(null);
            setInviteResult('');
          }}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {modal === 'create' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const b = Object.fromEntries(new FormData(e.target));
                attempt(async () => {
                  const s = await api('/spaces', 'POST', b);
                  await refreshSpaces(s.id);
                  setModal(null);
                });
              }}
            >
              <p>Um lugar só de vocês. Comece com um nome.</p>
              <label>
                Nome da comunidade
                <input
                  name="name"
                  required
                  maxLength={60}
                  placeholder="A turma do fim de tarde"
                  autoFocus
                />
              </label>
              <label>
                Descrição
                <textarea name="description" maxLength={300} placeholder="O que reúne vocês?" />
              </label>
              <button className="primary">
                Criar comunidade
                <Plus size={18} />
              </button>
            </form>
          )}
          {modal === 'join' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const raw = new FormData(e.target).get('code');
                let code = raw;
                try {
                  code = new URL(raw).searchParams.get('invite') || raw;
                } catch {}
                attempt(async () => {
                  const s = await api('/invites/' + encodeURIComponent(code) + '/join', 'POST');
                  await refreshSpaces(s.id);
                  setModal(null);
                });
              }}
            >
              <p>Recebeu um convite? Cole o link ou código abaixo.</p>
              <label>
                Convite
                <input name="code" required autoFocus placeholder="Cole seu convite aqui" />
              </label>
              <button className="primary">
                Entrar na comunidade
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {modal === 'invite' && (
            <>
              <p>Um link, uma boa companhia. O convite é limitado e pode ser revogado.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.target);
                  attempt(async () => {
                    const i = await api('/spaces/' + space + '/invites', 'POST', {
                      hours: Number(f.get('hours')),
                      uses: Number(f.get('uses')),
                    });
                    setInviteResult(i.url);
                  });
                }}
              >
                <label>
                  Expira em
                  <select name="hours">
                    <option value="24">24 horas</option>
                    <option value="168">7 dias</option>
                    <option value="1">1 hora</option>
                  </select>
                </label>
                <label>
                  Máximo de usos
                  <input name="uses" type="number" min="1" max="100" defaultValue="10" />
                </label>
                <button className="primary">
                  Gerar convite
                  <Link size={18} />
                </button>
              </form>
              {inviteResult && (
                <div className="invite-result">
                  <input aria-label="Link do convite" value={inviteResult} readOnly />
                  <IconButton label="Copiar convite" onClick={() => copy(inviteResult)}>
                    <Copy size={18} />
                  </IconButton>
                  <button
                    className="text-button"
                    onClick={() =>
                      attempt(async () => {
                        await api(
                          '/invites/' +
                            (IS_DESKTOP
                              ? inviteResult
                              : new URL(inviteResult).searchParams.get('invite')),
                          'DELETE',
                        );
                        setInviteResult('');
                        setNotice('Convite revogado.');
                      })
                    }
                  >
                    Revogar
                  </button>
                </div>
              )}
            </>
          )}
          {modal === 'channel' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.target);
                attempt(async () => {
                  await api('/spaces/' + space + '/channels', 'POST', {
                    name: f.get('name'),
                    kind: f.get('kind'),
                    private: f.get('private') === 'on',
                    members: String(f.get('members') || '')
                      .split(',')
                      .filter(Boolean),
                  });
                  setChannels(await api('/spaces/' + space + '/channels'));
                  setModal(null);
                });
              }}
            >
              <label>
                Nome
                <input name="name" required maxLength={60} />
              </label>
              <label>
                Tipo
                <select name="kind">
                  <option value="text">Conversa por texto</option>
                  <option value="voice">Sala de voz e vídeo</option>
                </select>
              </label>
              <label className="checkbox">
                <input name="private" type="checkbox" />
                Canal privado (administradores e pessoas selecionadas)
              </label>
              <label>
                Membros autorizados (IDs de usuário separados por vírgula)
                <input name="members" placeholder="Opcional para canal privado" />
              </label>
              <button className="primary">
                Criar canal
                <Plus size={18} />
              </button>
            </form>
          )}
          {modal === 'settings' && (
            <div className="settings">
              {IS_DESKTOP ? <DesktopInfo /> : <UsagePanel />}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const b = Object.fromEntries(new FormData(e.target));
                  attempt(async () => {
                    setUser(await api('/me', 'PATCH', b));
                    setNotice('Perfil atualizado.');
                  });
                }}
              >
                <span className="eyebrow">CONTA E PERFIL</span>
                <label>
                  Nome de exibição
                  <input name="display" defaultValue={user.display} required maxLength={60} />
                </label>
                <label>
                  Sobre você
                  <textarea name="bio" defaultValue={user.bio} maxLength={300} />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={user.status}>
                    <option value="online">Disponível</option>
                    <option value="away">Ausente</option>
                    <option value="busy">Não perturbe</option>
                    <option value="invisible">Invisível</option>
                  </select>
                </label>
                <label>
                  Status personalizado
                  <input name="custom_status" defaultValue={user.custom_status} maxLength={80} />
                </label>
                <button className="primary">
                  Salvar perfil
                  <Check size={18} />
                </button>
              </form>
              <hr />
              <span className="eyebrow">APARÊNCIA</span>
              <label>
                Tema
                <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="dark">Jardim à noite</option>
                  <option value="light">Luz da manhã</option>
                  <option value="plum">Ameixa</option>
                </select>
              </label>
              <label>
                Densidade
                <select value={density} onChange={(e) => setDensity(e.target.value)}>
                  <option value="comfortable">Confortável</option>
                  <option value="compact">Compacta</option>
                </select>
              </label>
              <label>
                Tamanho da fonte
                <select value={font} onChange={(e) => setFont(e.target.value)}>
                  <option value="14">Pequeno</option>
                  <option value="16">Padrão</option>
                  <option value="18">Grande</option>
                </select>
              </label>
              <hr />
              <span className="eyebrow">NOTIFICAÇÕES E SESSÕES</span>
              <p className="muted">
                As notificações do sistema não exibem o conteúdo das mensagens. O modo Não perturbe
                as silencia.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  attempt(async () => {
                    if (!('Notification' in window))
                      throw new Error('Este navegador não oferece notificações.');
                    if (!notifications) {
                      const p = await Notification.requestPermission();
                      if (p !== 'granted')
                        throw new Error('Permissão de notificações não concedida.');
                    }
                    localStorage.setItem('roda-notifications', String(!notifications));
                    setNotifications(!notifications);
                  })
                }
              >
                {notifications ? 'Desativar' : 'Ativar'} notificações do sistema
              </button>
              <p className="muted">
                Áudio e vídeo: escolha uma sala para testar e selecionar seus dispositivos. Ctrl/⌘ K
                busca; Enter envia; Shift + Enter quebra linha. Não há atalhos globais nem gravação.
              </p>
              <button
                className="danger"
                onClick={() =>
                  attempt(async () => {
                    await api('/auth/revoke', 'POST');
                    clearToken();
                    setCall(null);
                    setUser(null);
                  })
                }
              >
                Revogar todas as sessões
              </button>
              <button className="secondary" onClick={logout}>
                <LogOut size={17} />
                Sair da conta
              </button>
            </div>
          )}
          {modal === 'friends' && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const username = new FormData(e.target).get('username');
                  attempt(async () => {
                    await api('/friends', 'POST', { username });
                    setFriends(await api('/friends'));
                    setNotice('Solicitação enviada.');
                  });
                }}
              >
                <label>
                  Adicionar pelo nome de usuário
                  <input name="username" required placeholder="nome_do_amigo" />
                </label>
                <button className="primary">
                  Enviar solicitação
                  <Plus size={17} />
                </button>
              </form>
              <GroupCreator
                friends={friends}
                user={user}
                onError={report}
                onOpen={async (sid) => {
                  await refreshSpaces(sid);
                  setModal(null);
                }}
              />
              <div className="friend-list">
                {friends.length === 0 && (
                  <p>Ainda não há solicitações. Convide sua turma para começar.</p>
                )}
                {friends.map((f) => {
                  const other = f.sender === user.id ? f.recipient : f.sender;
                  return (
                    <div className="friend" key={f.sender + f.recipient}>
                      <Avatar name={f.display} />
                      <span>
                        <strong>{f.display}</strong>
                        <small>
                          @{f.username} ·{' '}
                          {
                            { pending: 'Pendente', accepted: 'Amigo', blocked: 'Bloqueado' }[
                              f.state
                            ]
                          }
                        </small>
                      </span>
                      {f.state === 'accepted' && (
                        <DirectButton
                          users={[other]}
                          onError={report}
                          onOpen={async (sid) => {
                            await refreshSpaces(sid);
                            setModal(null);
                          }}
                        />
                      )}
                      {f.state === 'pending' && f.recipient === user.id && (
                        <button
                          onClick={() =>
                            attempt(async () => {
                              await api('/friends/' + other, 'PATCH', { action: 'accept' });
                              setFriends(await api('/friends'));
                            })
                          }
                        >
                          Aceitar
                        </button>
                      )}
                      <button
                        onClick={() =>
                          attempt(async () => {
                            await api('/friends/' + other, 'PATCH', { action: 'remove' });
                            setFriends(await api('/friends'));
                          })
                        }
                      >
                        {f.state === 'blocked'
                          ? 'Desbloquear'
                          : f.state === 'accepted'
                            ? 'Remover'
                            : 'Cancelar / recusar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {modal === 'members' &&
            members.map((m) => (
              <div className="friend" key={m.id}>
                <Avatar name={m.display} />
                <span>
                  <strong>{m.display}</strong>
                  <small>
                    @{m.username} · {m.role}
                  </small>
                  <small>ID: {m.id}</small>
                </span>
              </div>
            ))}
          {modal === 'welcome' && (
            <>
              <p>
                O Papotato é seu lugar para reunir os amigos. Crie uma comunidade, compartilhe o
                convite e entre na mesma sala de voz.
              </p>
              <p className="muted">
                A mídia usa LiveKit com criptografia de transporte; não há criptografia ponta a
                ponta.{' '}
                {IS_DESKTOP
                  ? 'O histórico fica no Firebase. A capacidade das chamadas depende do serviço LiveKit.'
                  : 'O histórico fica no servidor da comunidade. Máximo configurado: 4 participantes por chamada.'}
              </p>
              <button className="primary" onClick={() => setModal('create')}>
                Criar uma comunidade
                <Plus size={18} />
              </button>
            </>
          )}
          {modal?.type === 'actions' && (
            <div className="settings">
              <button
                className="secondary"
                onClick={() =>
                  attempt(async () => {
                    await api('/messages/' + modal.message.id + '/reactions', 'POST', {
                      emoji: '💚',
                    });
                    await refreshMessages();
                    setModal(null);
                  })
                }
              >
                Reagir com 💚
              </button>
              {canManage && (
                <button
                  className="secondary"
                  onClick={() =>
                    attempt(async () => {
                      await api('/messages/' + modal.message.id + '/pin', 'POST');
                      await refreshMessages();
                      setModal(null);
                    })
                  }
                >
                  Fixar / desafixar
                </button>
              )}
              {modal.message.user_id === user.id && (
                <button
                  className="secondary"
                  onClick={() => setModal({ type: 'edit', message: modal.message })}
                >
                  Editar mensagem
                </button>
              )}
              {(modal.message.user_id === user.id || canManage) && (
                <button
                  className="danger"
                  onClick={() => setModal({ type: 'delete', message: modal.message })}
                >
                  Excluir mensagem
                </button>
              )}
            </div>
          )}
          {modal?.type === 'edit' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                attempt(async () => {
                  await api('/messages/' + modal.message.id, 'PATCH', {
                    body: new FormData(e.target).get('body'),
                  });
                  await refreshMessages();
                  setModal(null);
                });
              }}
            >
              <label>
                Mensagem
                <textarea
                  name="body"
                  defaultValue={modal.message.body}
                  required
                  maxLength={4000}
                  rows={5}
                />
              </label>
              <button className="primary">
                Salvar edição
                <Check size={18} />
              </button>
            </form>
          )}
          {modal?.type === 'delete' && (
            <>
              <p>Excluir esta mensagem? O histórico mostrará que ela foi removida.</p>
              <button
                className="danger"
                onClick={() =>
                  attempt(async () => {
                    await api('/messages/' + modal.message.id, 'DELETE');
                    await refreshMessages();
                    setModal(null);
                  })
                }
              >
                Excluir mensagem
              </button>
            </>
          )}
          {modal?.type === 'profile' && (
            <>
              <Avatar name={modal.member.display} large />
              <p>@{modal.member.username}</p>
              <p>{modal.member.custom_status}</p>
              <small>ID: {modal.member.id}</small>
              {modal.member.id !== user.id && (
                <button
                  className="danger"
                  onClick={() =>
                    attempt(async () => {
                      await api('/friends/' + modal.member.id, 'PATCH', { action: 'block' });
                      setNotice(
                        'Usuário bloqueado para solicitações de amizade. Mensagens em comunidades compartilhadas permanecem visíveis.',
                      );
                      setModal(null);
                    })
                  }
                >
                  Bloquear solicitações deste usuário
                </button>
              )}
            </>
          )}
        </Modal>
      )}
      {(prejoin || call) && (
        <Suspense fallback={<div className="banner notice">Carregando controles de chamada…</div>}>
          <MediaUI
            {...{
              prejoin,
              setPrejoin: cancelPrejoin,
              joiningCall,
              user,
              startCall,
              report,
              call,
              callMin,
              setCallMin,
              setCall,
              Modal,
              IconButton,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(
  IS_DESKTOP ? (
    <DesktopGate>
      <App />
    </DesktopGate>
  ) : (
    <ServiceGate>
      <App />
    </ServiceGate>
  ),
);
