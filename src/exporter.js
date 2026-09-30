// Export dos PNGs. O caminho preferido e gravar direto em ./out/ pelo servidor
// local - e o que o build.sh consome, e evita 60 downloads no navegador. Se o
// servidor nao estiver de pe, cai pro download normal.

let temServidor = null;

export async function checarServidor() {
  if (temServidor !== null) return temServidor;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    temServidor = r.ok;
  } catch { temServidor = false; }
  return temServidor;
}

function baixar(nome, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function salvar(nome, blob) {
  if (await checarServidor()) {
    const r = await fetch(`/api/frame?name=${encodeURIComponent(nome)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    if (!r.ok) throw new Error(`servidor recusou ${nome}: ${await r.text()}`);
    return 'out/';
  }
  baixar(nome, blob);
  return 'download';
}

const paraBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

/**
 * Renderiza UMA volta de 360 graus em N frames e grava cada um como PNG numerado.
 * As duas voltas do video saem no ffmpeg repetindo esta sequencia - nunca
 * renderizando 720 graus.
 */
export async function exportarSequencia({ canvas, renderFrame, frames, sentido, prefixo = 'boto', onProgress }) {
  const destino = (await checarServidor()) ? 'out/' : 'downloads';
  let ultimo = destino;

  if (destino === 'downloads' && frames > 8) {
    const ok = confirm(
      `O servidor local nao respondeu, entao os ${frames} frames vao sair como ` +
      `downloads separados do navegador.\n\nPra gravar direto em ./out/ (o que o ` +
      `build.sh usa), rode "npm start" e abra por http://localhost:5173.\n\nContinuar assim mesmo?`
    );
    if (!ok) return { cancelado: true };
  }

  // Limpa ./out/ antes: se a corrida anterior teve MAIS frames, os que sobram
  // continuam numerados na sequencia e o ffmpeg os engole junto, colando um pedaco
  // de outra volta no fim do loop.
  if (destino === 'out/') {
    const r = await fetch('/api/clear', { method: 'POST' });
    if (!r.ok) throw new Error(`nao consegui limpar ./out/: ${await r.text()}`);
  }

  for (let i = 0; i < frames; i++) {
    const ang = sentido * 360 * (i / frames); // i/frames, nao i/(frames-1): o
                                              // ultimo frame nao pode repetir o
                                              // primeiro, senao o loop trava 1 frame
    renderFrame(ang);
    const blob = await paraBlob(canvas);
    const nome = `${prefixo}_${String(i + 1).padStart(4, '0')}.png`;
    ultimo = await salvar(nome, blob);
    onProgress?.(i + 1, frames, nome);
    await new Promise((r) => setTimeout(r, 0)); // devolve a thread pra UI respirar
  }

  return { destino: ultimo, frames };
}

export async function exportarFrameAtual({ canvas, renderFrameAtual, nome }) {
  renderFrameAtual();
  const blob = await paraBlob(canvas);
  return salvar(nome, blob);
}
