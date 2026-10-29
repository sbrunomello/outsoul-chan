import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { syncReactionImages } from './sync-reactions';

export const App = () => {
  const [canSync, setCanSync] = useState(false);
  const [syncState, setSyncState] = useState('');
  const [syncing, setSyncing] = useState(false);
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
  const syncReactions = async (): Promise<void> => {
    setSyncing(true);
    setSyncState('Preparando imagens...');
    try {
      await syncReactionImages(setSyncState);
      setSyncState('Biblioteca piloto sincronizada no Reddit.');
    } catch (error) {
      setSyncState(error instanceof Error ? error.message : 'Erro ao sincronizar imagens.');
    } finally {
      setSyncing(false);
    }
  };
  return (
    <main className="min-h-screen bg-[#17131c] px-5 py-8 text-[#f8f0ff]">
      <section className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-3xl border border-[#63377d] bg-[#261d30] p-7 text-center shadow-xl">
        <img className="h-44 w-44 object-contain" src="/reactions/joy_01.png" alt="Outsoul-chan sorrindo" />
        <p className="text-xs uppercase tracking-[0.3em] text-[#e78dd1]">guia rápido</p>
        <h1 className="text-3xl font-bold">Outsoul-chan</h1>
        <p className="max-w-md text-base leading-relaxed text-[#ded1e8]">Bot do sub que comenta memes, imagens e papo de anime. Chame em um comentário com <strong>!outsoul [texto]</strong> ou escreva <strong>Outsoul-chan</strong> em qualquer parte dele.</p>
        {canSync ? (
          <>
            <button className="rounded-full bg-[#9d4dba] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={syncing} onClick={syncReactions}>
              {syncing ? 'Sincronizando imagens...' : 'Sincronizar imagens de reação'}
            </button>
            {syncState ? <p className="text-xs text-[#e7c8f2]">{syncState}</p> : null}
          </>
        ) : null}
      </section>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
