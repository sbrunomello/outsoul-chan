import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { syncReactionImages } from './sync-reactions';

export const Splash = () => {
  const [canSync, setCanSync] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/reactions/permission')
      .then(async (response) => {
        if (!response.ok) return false;
        const result: unknown = await response.json();
        return typeof result === 'object' && result !== null && 'canSync' in result && result.canSync === true;
      })
      .then((allowed) => { if (active) setCanSync(allowed); })
      .catch(() => { if (active) setCanSync(false); });
    return () => { active = false; };
  }, []);

  const onSync = async (): Promise<void> => {
    setSyncing(true);
    setSyncState('Preparando imagens...');
    try {
      await syncReactionImages(setSyncState);
      setSyncState('Imagens de reação sincronizadas neste sub.');
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : 'Erro ao sincronizar imagens.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#17131c] px-5 py-6 text-center text-[#f8f0ff]">
      <img className="h-20 w-20 object-contain" src="/reactions/joy_01.png" alt="Outsoul-chan" />
      <p className="text-xs uppercase tracking-[0.25em] text-[#e78dd1]">mascote do sub</p>
      <h1 className="text-2xl font-bold">Outsoul-chan</h1>
      <p className="max-w-sm text-sm text-[#ded1e8]">
        Bot do sub que comenta memes, imagens e papo de anime. Chame em um comentário com <code className="rounded bg-[#32243d] px-1.5 py-0.5 text-[#f2b7ff]">!outsoul [texto]</code> ou escreva <code className="rounded bg-[#32243d] px-1.5 py-0.5 text-[#f2b7ff]">Outsoul-chan</code> em qualquer parte do comentário.
      </p>
      {canSync ? (
        <div className="mt-1 flex flex-col items-center gap-2">
          <button
            className="flex h-10 cursor-pointer items-center justify-center rounded-full bg-[#9d4dba] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#b45bcf] disabled:cursor-wait disabled:opacity-50"
            disabled={syncing}
            onClick={() => { void onSync(); }}
          >
            {syncing ? 'Sincronizando imagens...' : 'Sincronizar imagens de reação'}
          </button>
          {syncState ? <p className="max-w-sm text-xs text-[#e7c8f2]">{syncState}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
