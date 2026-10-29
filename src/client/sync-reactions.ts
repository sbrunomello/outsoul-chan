import reactionManifest from '../shared/reactions/manifest.json';

const reactionIds = reactionManifest
  .filter((entry) => entry.approved && entry.enabled)
  .map((entry) => entry.id);

const toDataUrl = (bytes: ArrayBuffer): string => {
  const values = new Uint8Array(bytes);
  let binary = '';
  for (const value of values) binary += String.fromCharCode(value);
  return `data:image/png;base64,${btoa(binary)}`;
};

export const syncReactionImages = async (onProgress: (message: string) => void): Promise<void> => {
  for (const id of reactionIds) {
    const response = await fetch(`/reactions/${id}.png`);
    if (!response.ok) throw new Error(`Falha ao ler ${id}`);
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    const upload = await fetch('/api/reactions/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, dataUrl: toDataUrl(bytes), sha256 }),
    });
    if (!upload.ok) throw new Error(`Sincronização recusada para ${id} (HTTP ${upload.status})`);
    onProgress(`Imagem ${id} sincronizada.`);
  }
};
