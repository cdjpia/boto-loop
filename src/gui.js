import GUI from 'lil-gui';
import { HERO } from './params.js';
import { aplicarCor } from './leds.js';
import { exportarSequencia, exportarFrameAtual, checarServidor } from './exporter.js';

export function montarGUI({ P, LEDS, app }) {
  const gui = new GUI({ title: 'boto-loop' });
  const redesenhar = () => app.renderFrame(P.spin);

  // ------------------------------------------------------------------ pose
  const pose = gui.addFolder('pose');
  pose.add(P, 'yaw', -180, 180, 0.5).name('yaw inicial (°)').onChange(() => { app.aplicarPose(); redesenhar(); });
  // O slider e "bico pra cima" e o valor positivo levanta o bico. A inversao de
  // sinal pro rotation.x do tiltGroup esta no main.js - aqui nao tem pegadinha.
  pose.add(P, 'bicoUp', -45, 45, 0.5).name('bico pra cima (°)').onChange(() => { app.aplicarPose(); redesenhar(); });
  pose.add(P, 'roll', -30, 30, 0.5).name('roll (°)').onChange(() => { app.aplicarPose(); redesenhar(); });
  pose.add({
    hero() {
      P.yaw = HERO.yaw; P.bicoUp = HERO.bicoUp; P.roll = HERO.roll;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      app.aplicarPose(); redesenhar();
    },
  }, 'hero').name('▸ pose do hero (30 / 0 / -2)');

  // ------------------------------------------------------------------ giro
  const giro = gui.addFolder('giro');
  giro.add(P, 'girando').name('girando');
  giro.add(P, 'sentido', { 'anti-horário': 1, 'horário': -1 }).name('sentido');
  giro.add(P, 'velocidade', 1, 180, 1).name('velocidade (°/s)');
  giro.add(P, 'frames', 12, 240, 1).name('frames (uma volta)');
  giro.add(P, 'spin', 0, 360, 0.5).name('spin manual (°)').listen()
    .onChange((v) => { P.girando = false; app.renderFrame(v); });

  // ------------------------------------------------------------------ enquadramento
  const enq = gui.addFolder('enquadramento');
  enq.add(P, 'compensacao', 0, 1, 0.01).name('compensação')
    .onChange(redesenhar);
  enq.add(P, 'preenchimento', 0.4, 1.4, 0.005).name('preenchimento')
    .onChange(redesenhar);
  enq.add(P, 'fov', 12, 60, 0.5).name('fov (°)').onChange(redesenhar);
  enq.add(P, 'guias').name('moldura na tela').onChange(() => app.atualizarFundoTeste());
  enq.add({ i: 'altura ≈0.92 é menor que a largura ≈2.01.\no ar em cima e embaixo é onde vai a tipografia.' }, 'i')
    .name('sobra vertical').disable();

  // ------------------------------------------------------------------ render
  const rnd = gui.addFolder('render');
  rnd.add(P, 'resolucao', [720, 1080, 1440, 2048, 2880]).name('resolução')
    .onChange((v) => app.setResolucao(v));
  rnd.add(P, 'escalaEstatico', 1, 3, 1).name('×res do frame estático');

  const bl = gui.addFolder('bloom');
  bl.add(P, 'bloomForca', 0, 3, 0.01).name('força').onChange(() => { app.atualizarBloom(); redesenhar(); });
  bl.add(P, 'bloomThreshold', 0, 1.5, 0.01).name('threshold').onChange(() => { app.atualizarBloom(); redesenhar(); });
  bl.add(P, 'bloomRaio', 0, 1.5, 0.01).name('raio').onChange(() => { app.atualizarBloom(); redesenhar(); });
  bl.add(P, 'alphaBrilho', 0, 2, 0.01).name('alpha do halo').onChange(() => { app.atualizarBloom(); redesenhar(); });

  // ------------------------------------------------------------------ material
  const mat = gui.addFolder('casco');
  const repintar = () => { app.repintar(); redesenhar(); };
  mat.addColor(P, 'cor').name('magenta').onChange(repintar);
  mat.addColor(P, 'corAco').name('aço escovado').onChange(repintar);
  mat.addColor(P, 'corBronze').name('crista bronze').onChange(repintar);
  mat.add(P, 'fracaoAco', 0, 1, 0.01).name('fração de aço').onChange(repintar);
  mat.add(P, 'viesCabeca', 0, 1, 0.01).name('aço na cabeça').onChange(repintar);
  mat.add(P, 'seed', 1, 9999, 1).name('semente das chapas').onChange(repintar);
  const atualizarMat = () => { app.atualizarMaterial(); redesenhar(); };
  mat.add(P, 'metalness', 0, 1, 0.01).name('metalness').onChange(atualizarMat);
  mat.add(P, 'roughness', 0, 1, 0.01).name('roughness').onChange(atualizarMat);
  mat.add(P, 'clearcoat', 0, 1, 0.01).name('clearcoat').onChange(atualizarMat);
  mat.add(P, 'envMap', 0, 3, 0.01).name('envMap').onChange(atualizarMat);
  const luz = mat.addFolder('luz');
  luz.add(P, 'luzKey', 0, 6, 0.05).name('key').onChange(() => { app.atualizarLuz(); redesenhar(); });
  luz.add(P, 'luzRim', 0, 6, 0.05).name('rim').onChange(() => { app.atualizarLuz(); redesenhar(); });
  luz.close();

  // ------------------------------------------------------------------ LEDs
  const ledsF = gui.addFolder('LEDs');

  // Posicao/escala mexem na geometria, entao o enquadramento tem que ser refeito -
  // os bulbos do dorso participam do calculo de caber no quadro.
  const mexeu = (nome) => () => {
    app.leds.sync(LEDS);
    aplicarCor(app.leds.materiais[nome], LEDS[nome]);
    app.refazerFit();
    redesenhar();
  };

  function comuns(f, nome, faixaXY = 1.1) {
    const cfg = LEDS[nome];
    const on = mexeu(nome);
    f.add(cfg, 'visivel').name('ligado').onChange(on);
    f.add(cfg, 'x', -faixaXY, faixaXY, 0.005).name('x (bico ← → cauda)').onChange(on);
    f.add(cfg, 'y', -0.6, 0.6, 0.005).name('y (altura)').onChange(on);
    f.add(cfg, 'z', -0.7, 0.7, 0.005).name('z (lateral)').onChange(on);
    f.add(cfg, 'escala', 0.1, 3, 0.005).name('escala').onChange(on);
    f.addColor(cfg, 'cor').name('cor').onChange(on);
    f.add(cfg, 'intensidade', 0, 8, 0.05).name('intensidade').onChange(on);
    return on;
  }

  const fOlhos = ledsF.addFolder('olhos');
  comuns(fOlhos, 'olhos');

  const fBoca = ledsF.addFolder('boca');
  const onBoca = comuns(fBoca, 'boca');
  fBoca.add(LEDS.boca, 'comprimento', 0.05, 1.2, 0.005).name('comprimento').onChange(onBoca);
  fBoca.add(LEDS.boca, 'altura', 0.01, 0.3, 0.002).name('altura').onChange(onBoca);
  fBoca.add(LEDS.boca, 'largura', 0.02, 0.5, 0.002).name('largura').onChange(onBoca);

  const fNad = ledsF.addFolder('nadadeiras');
  const onNad = comuns(fNad, 'nadadeiras');
  fNad.add(LEDS.nadadeiras, 'comprimento', 0.05, 0.8, 0.005).name('comprimento').onChange(onNad);
  fNad.add(LEDS.nadadeiras, 'altura', 0.05, 0.6, 0.005).name('altura').onChange(onNad);
  fNad.add(LEDS.nadadeiras, 'inclinacao', -90, 90, 1).name('inclinação (°)').onChange(onNad);

  const fDorso = ledsF.addFolder('dorso');
  const onDorso = comuns(fDorso, 'dorso');
  fDorso.add(LEDS.dorso, 'contagem', 2, 40, 1).name('contagem')
    .onChange(() => { app.leds.rebuildDorso(); app.refazerFit(); redesenhar(); });
  fDorso.add(LEDS.dorso, 'espacamento', 0.01, 0.2, 0.002).name('espaçamento').onChange(onDorso);
  fDorso.add(LEDS.dorso, 'raio', 0.005, 0.1, 0.001).name('raio do bulbo').onChange(onDorso);
  fDorso.add(LEDS.dorso, 'seguirDorso').name('seguir a linha das costas').onChange(onDorso);
  fDorso.add(LEDS.dorso, 'curva', -0.2, 0.2, 0.002).name('curvatura (se não seguir)').onChange(onDorso);

  [fOlhos, fBoca, fNad, fDorso].forEach((f) => f.close());

  // ------------------------------------------------------------------ teste
  const teste = gui.addFolder('fundo de teste');
  teste.add(P, 'fundoTeste').name('ligar (só na tela)').onChange(() => app.atualizarFundoTeste());
  teste.addColor(P, 'corFundoTeste').name('cor').onChange(() => app.atualizarFundoTeste());
  teste.add({ i: 'não entra no export — é CSS atrás do canvas' }, 'i').name('aviso').disable();

  // ------------------------------------------------------------------ export
  const exp = gui.addFolder('export');
  const estado = { destino: 'verificando…' };
  const cDestino = exp.add(estado, 'destino').name('destino').disable();
  checarServidor().then((ok) => {
    estado.destino = ok ? './out/ (servidor)' : 'downloads do navegador';
    cDestino.updateDisplay();
  });

  const acoes = {
    async sequencia() {
      const girava = P.girando;
      P.girando = false;
      app.setExportando(true);
      try {
        const r = await exportarSequencia({
          canvas: app.canvas,
          renderFrame: (ang) => app.renderFrame(ang),
          frames: Math.round(P.frames),
          sentido: P.sentido,
          onProgress: (i, n, nome) => app.hud(`<b>exportando</b> ${i}/${n}   ${nome}`),
        });
        if (r.cancelado) app.hud('export cancelado');
        else app.hud(`<b>pronto</b> ${r.frames} frames → ${r.destino}\nagora: ./build.sh`);
      } catch (e) {
        app.hud(`<b>erro no export</b>\n${e.message}`);
      } finally {
        app.setExportando(false);
        P.girando = girava;
      }
    },

    async frameAtual() {
      const res = P.resolucao;
      const alvo = res * Math.round(P.escalaEstatico);
      app.setExportando(true);
      try {
        app.setResolucao(alvo);
        const destino = await exportarFrameAtual({
          canvas: app.canvas,
          renderFrameAtual: () => app.renderFrame(P.spin),
          nome: `boto_still_${alvo}px_${Math.round(P.spin)}deg.png`,
        });
        app.hud(`<b>frame estático</b> ${alvo}×${alvo} → ${destino}`);
      } finally {
        app.setResolucao(res);
        app.setExportando(false);
      }
    },
  };

  exp.add(acoes, 'sequencia').name('▸ exportar sequência (360° / N frames)');
  exp.add(acoes, 'frameAtual').name('▸ exportar frame atual (alta res)');

  gui.folders.forEach((f) => { if (f !== pose && f !== exp) f.close(); });
  app.atualizarFundoTeste();
  return gui;
}
