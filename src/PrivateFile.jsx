import React, { useEffect, useState } from 'react';
import { apiFetch } from './client.js';
const isPrivate = (path) => typeof path === 'string' && /^\/api\/files\/[a-f0-9-]+$/i.test(path);
function useFile(path) {
  const [file, setFile] = useState(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!isPrivate(path)) return;
    const controller = new AbortController();
    let url,
      active = true;
    setFile(null);
    setError('');
    (async () => {
      try {
        const response = await apiFetch(path.slice(4), { signal: controller.signal });
        if (!response.ok) throw new Error('Arquivo indisponível ou sem permissão.');
        const blob = await response.blob();
        if (!active) return;
        url = URL.createObjectURL(blob);
        setFile({ url, type: blob.type });
      } catch (e) {
        if (active) setError(e.message);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  return { file, error };
}
function Download({ href, children }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function download(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(href.slice(4));
      if (!response.ok) throw new Error('Não foi possível baixar este arquivo.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = String(children) || 'arquivo';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="file-download" onClick={download} aria-busy={busy}>
        {busy ? 'Baixando…' : children}
      </button>
      {error && <small role="alert">{error}</small>}
    </>
  );
}
function MediaFile({ href, children }) {
  const { file, error } = useFile(href);
  return (
    <span className="attachment">
      {error ? (
        <small role="alert">{error}</small>
      ) : file ? (
        file.type.startsWith('video/') ? (
          <video controls playsInline preload="metadata" src={file.url} />
        ) : file.type.startsWith('audio/') ? (
          <audio controls preload="metadata" src={file.url} />
        ) : null
      ) : (
        <small>Carregando anexo…</small>
      )}
      <Download href={href}>{children}</Download>
    </span>
  );
}
export function AttachmentLink({ href, children, ...props }) {
  if (isPrivate(href)) {
    return /\.(mp3|ogg|mp4)$/i.test(String(children)) ? (
      <MediaFile href={href}>{children}</MediaFile>
    ) : (
      <Download href={href}>{children}</Download>
    );
  }
  return (
    <a href={href} {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
function PrivateImage({ src, alt }) {
  const { file, error } = useFile(src);
  if (error) return <span role="alert">{error}</span>;
  return file ? (
    <img src={file.url} alt={alt || 'Imagem anexada'} loading="lazy" />
  ) : (
    <span>Carregando imagem…</span>
  );
}
export function AttachmentImage({ src, alt, ...props }) {
  return isPrivate(src) ? (
    <PrivateImage src={src} alt={alt} />
  ) : (
    <img src={src} alt={alt || ''} {...props} loading="lazy" referrerPolicy="no-referrer" />
  );
}
