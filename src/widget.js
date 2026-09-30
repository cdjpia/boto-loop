// Widget publicado (widget.html): o boto num iframe responsivo, fundo transparente,
// arrastar pra girar e um painel curto de personalizacao. Reaproveita a malha, o
// chapeado, os LEDs e o composer do editor; nada de export nem de lil-gui aqui.
//
// Parametros de URL, pra configurar pelo Embed do Framer:
//   ?lang=en|pt   idioma (default: o do navegador)
//   ?ui=0         esconde o botao do painel
//   ?hint=0       esconde a dica "arraste pra girar"
//   ?spin=0       comeca parado
//   ?speed=24     graus por segundo
//   ?color=DF378B cor do corpo (hex, sem #)
//   ?lights=00CFFF cor unica pros LEDs (sem o parametro: cores originais)
//   ?glow=0.45    forca do bloom

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { P, LEDS } from './params.js';
import { paintPanels, bodyMaterial } from './materials.js';
import { buildLeds, aplicarCor } from './leds.js';
import { fitDistance, poseMatrix } from './framing.js';
import { criarAmbiente, criarComposer, amostrarDorso, pontosDeEnquadramento } from './pipeline.js';

const DEG = THREE.MathUtils.degToRad;
const $ = (s) => document.querySelector(s);
const url = new URLSearchParams(location.search);

// ---------------------------------------------------------------- textos

const TEXTOS = {
  en: {
    titulo: 'Customize', corpo: 'Body', luzes: 'Lights', brilho: 'Glow',
    girar: 'Auto-spin', velocidade: 'Speed', restaurar: 'Reset',
    dica: 'Drag to rotate', abrir: 'Customize', fechar: 'Close',
    canvas: '3D boto. Drag or use the arrow keys to rotate.',
    original: 'Original colors', livre: 'Custom color', erro: 'Could not load the 3D model.',
  },
  pt: {
    titulo: 'Personalizar', corpo: 'Corpo', luzes: 'Luzes', brilho: 'Brilho',
    girar: 'Girar sozinho', velocidade: 'Velocidade', restaurar: 'Restaurar',
    dica: 'Arraste para girar', abrir: 'Personalizar', fechar: 'Fechar',
    canvas: 'Boto 3D. Arraste ou use as setas para girar.',
    original: 'Cores originais', livre: 'Cor livre', erro: 'Não foi possível carregar o modelo 3D.',
  },
};

const lerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

let idioma = url.get('lang') || lerLocal('boto-lang')
  || ((navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en');
if (!TEXTOS[idioma]) idioma = 'en';
const t = (k) => TEXTOS[idioma][k];

// ---------------------------------------------------------------- estado

// O widget nao pulsa como o loop exportado: com o usuario arrastando, o tamanho
// constante (compensacao alta) le melhor. Preenchimento abaixo de 1 deixa espaco
// pro halo do bloom nao bater na borda do iframe.
const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hex = (v) => (v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toUpperCase()}` : null);
const num = (v, min, max) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? THREE.MathUtils.clamp(n, min, max) : null;
};

const CORES_LED_ORIGINAIS = Object.fromEntries(Object.entries(LEDS).map(([k, v]) => [k, v.cor]));

const PADRAO = {
  cor: hex(url.get('color')) ?? P.cor,
  luzes: hex(url.get('lights')) ?? null, // null = cores originais de cada grupo
  brilho: num(url.get('glow'), 0, 1.5) ?? P.bloomForca,
  girando: url.get('spin') === '0' ? false : !reduzMovimento,
  velocidade: num(url.get('speed'), 4, 120) ?? P.velocidade,
};
const estado = { ...PADRAO };

Object.assign(P, { compensacao: 0.8, preenchimento: 0.82 });

// ---------------------------------------------------------------- renderer

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(P.fov, 1, 0.01, 100);
criarAmbiente(renderer, scene, P);

const spinGroup = new THREE.Group();
const tiltGroup = new THREE.Group();
spinGroup.add(tiltGroup);
scene.add(spinGroup);

const leds = buildLeds(LEDS);
tiltGroup.add(leds.root);

const { composer, bloom, alphaPass } = criarComposer(renderer, scene, camera, P, 1, 1);
// apara a cauda do halo: sobre a pagina do Framer (fundo qualquer) ela vira nuvem
alphaPass.uniforms.corte.value = 0.22;

let modelo = null;
let pontosFit = null;

// ---------------------------------------------------------------- tamanho

let largura = 0, altura = 0;

function redimensionar() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  if (w === largura && h === altura) return;
  largura = w; altura = h;
  // DPR ate 2: acima disso o bloom custa caro no celular e ninguem ve a diferenca.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  sujo = true;
}
window.addEventListener('resize', redimensionar);

// ---------------------------------------------------------------- enquadramento

function atualizarCamera() {
  if (!pontosFit) return;
  // Frame de qualquer proporcao: o fit testa largura e altura separadas, entao o
  // boto cabe tanto num Embed largo (desktop) quanto num alto (celular).
  const tanV = Math.tan(DEG(P.fov) / 2);
  const tanH = tanV * camera.aspect;
  const pitch = -DEG(P.bicoUp), yaw = DEG(P.yaw), roll = DEG(P.roll);
  const dFixo = fitDistance(pontosFit, poseMatrix(0, pitch, yaw, roll), tanH, tanV, P.preenchimento);
  const dDin = fitDistance(pontosFit, poseMatrix(DEG(P.spin), pitch, yaw, roll), tanH, tanV, P.preenchimento);
  camera.fov = P.fov;
  camera.position.set(0, 0, THREE.MathUtils.lerp(dFixo, dDin, P.compensacao));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- aparencia

function aplicarCorpo() {
  P.cor = estado.cor;
  if (modelo) paintPanels(modelo.geometry, P);
}

function aplicarLuzes() {
  for (const nome of Object.keys(LEDS)) {
    LEDS[nome].cor = estado.luzes ?? CORES_LED_ORIGINAIS[nome];
    aplicarCor(leds.materiais[nome], LEDS[nome]);
  }
}

function aplicarBrilho() { bloom.strength = estado.brilho; }

// ---------------------------------------------------------------- giro e arrasto

// Uma regra so pra tudo: a velocidade angular corre atras do alvo (giro automatico
// ou zero) com atrito exponencial. Soltar o arrasto com impulso da inercia, que
// vai morrendo ate virar o giro automatico de novo - sem estado de "voltando".
const GRAUS_POR_PX = 0.45;
let vel = 0;              // graus/s
let arrastando = false;
let ultimoX = 0, ultimoT = 0;
let sujo = true;          // precisa renderizar mesmo parado

const alvo = () => (estado.girando ? P.sentido * estado.velocidade : 0);

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  arrastando = true;
  ultimoX = e.clientX; ultimoT = e.timeStamp;
  vel = 0;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('arrastando');
  esconderDica();
});

canvas.addEventListener('pointermove', (e) => {
  if (!arrastando) return;
  const dx = e.clientX - ultimoX;
  const dt = Math.max(1, e.timeStamp - ultimoT) / 1000;
  P.spin += dx * GRAUS_POR_PX;
  // media movel: um evento isolado com dt minusculo nao vira um arremesso
  vel = THREE.MathUtils.lerp(vel, (dx * GRAUS_POR_PX) / dt, 0.5);
  ultimoX = e.clientX; ultimoT = e.timeStamp;
  sujo = true;
});

function soltar(e) {
  if (!arrastando) return;
  arrastando = false;
  canvas.classList.remove('arrastando');
  // parado ha mais de 80ms antes de soltar = sem impulso
  if (e.timeStamp - ultimoT > 80) vel = 0;
  vel = THREE.MathUtils.clamp(vel, -720, 720);
}
canvas.addEventListener('pointerup', soltar);
canvas.addEventListener('pointercancel', soltar); // gesto vertical virou rolagem da pagina

canvas.addEventListener('keydown', (e) => {
  const passo = e.shiftKey ? 45 : 15;
  if (e.key === 'ArrowLeft') P.spin -= passo;
  else if (e.key === 'ArrowRight') P.spin += passo;
  else return;
  e.preventDefault();
  sujo = true;
});

// ---------------------------------------------------------------- loop

// So renderiza quando o iframe esta na tela: numa pagina do Framer o widget passa
// a maior parte do tempo fora da vista. Aba escondida o proprio rAF ja pausa.
let naTela = true;
new IntersectionObserver(([en]) => { naTela = en.isIntersecting; }).observe(canvas);

let anterior = performance.now();

function loop(agora) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (agora - anterior) / 1000);
  anterior = agora;
  if (!naTela || !modelo) return;

  if (!arrastando) {
    vel += (alvo() - vel) * (1 - Math.exp(-dt * 1.6));
    if (Math.abs(vel) < 0.01 && alvo() === 0) vel = 0;
    P.spin += vel * dt;
  }
  if (!sujo && vel === 0 && !arrastando) return;
  sujo = false;

  P.spin = ((P.spin % 360) + 360) % 360;
  spinGroup.rotation.y = DEG(P.spin);
  atualizarCamera();
  composer.render();
}

// ---------------------------------------------------------------- carga

function aplicarPose() {
  // mesmo sinal do editor: bicoUp positivo levanta o bico (ver main.js)
  tiltGroup.rotation.x = -DEG(P.bicoUp);
  modelo.rotation.set(0, DEG(P.yaw), DEG(P.roll), 'XYZ');
  leds.root.rotation.copy(modelo.rotation);
}

redimensionar();

new GLTFLoader().load(new URL('../boto_low.glb', import.meta.url).href, (gltf) => {
  const src = gltf.scene.getObjectByProperty('type', 'Mesh');
  let geo = src.geometry;
  const pontosCorpo = new Float32Array(geo.attributes.position.array);

  // mesma preparacao do editor: desindexar pro flat shading facetado
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();

  P.cor = estado.cor;
  paintPanels(geo, P);
  modelo = new THREE.Mesh(geo, bodyMaterial(P));
  tiltGroup.add(modelo);
  aplicarPose();

  leds.perfilDorsal = amostrarDorso(geo);
  leds.sync(LEDS);
  aplicarLuzes();
  aplicarBrilho();
  pontosFit = pontosDeEnquadramento(pontosCorpo, leds.root);

  vel = alvo();
  sujo = true;
  requestAnimationFrame((ts) => { anterior = ts; loop(ts); });
  canvas.classList.add('pronto');
  mostrarDica();
}, undefined, (err) => {
  console.error(err);
  const d = document.createElement('div');
  d.className = 'erro';
  d.textContent = t('erro');
  document.body.append(d);
});

// ---------------------------------------------------------------- dica

let dicaTimer = 0;
function mostrarDica() {
  if (url.get('hint') === '0') return;
  $('#dica').classList.add('visivel');
  dicaTimer = setTimeout(esconderDica, 3500);
}
function esconderDica() {
  clearTimeout(dicaTimer);
  $('#dica').classList.remove('visivel');
}

// ---------------------------------------------------------------- painel

const CORES_CORPO = ['#DF378B', '#7B3FE4', '#1F7BFF', '#12B886', '#F2A900', '#E23D28', '#C9CDD2'];
const CORES_LUZES = [null, '#00CFFF', '#FF3B0F', '#FFA51E', '#B6FF3B', '#FF4FD8', '#FFFFFF'];

function montarAmostras(el, cores, chave, aplicar) {
  const botoes = cores.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'amostra' + (c === null ? ' original' : '');
    if (c) b.style.setProperty('--c', c);
    b.dataset.cor = c ?? '';
    b.addEventListener('click', () => { estado[chave] = c; aplicar(); marcar(); sujo = true; });
    el.append(b);
    return b;
  });

  // cor livre: input nativo escondido dentro de um circulo arco-iris
  const livre = document.createElement('label');
  livre.className = 'amostra livre';
  const input = document.createElement('input');
  input.type = 'color';
  input.addEventListener('input', () => {
    estado[chave] = input.value.toUpperCase(); aplicar(); marcar(); sujo = true;
  });
  livre.append(input);
  el.append(livre);

  function marcar() {
    const atual = estado[chave] ?? '';
    let achou = false;
    for (const b of botoes) {
      const sim = b.dataset.cor.toUpperCase() === atual.toUpperCase();
      b.setAttribute('aria-pressed', String(sim));
      achou ||= sim;
    }
    // cor livre escolhida: o circulo arco-iris vira a propria cor e ganha o anel
    livre.classList.toggle('marcada', !achou && !!atual);
    livre.style.background = !achou && atual ? atual : '';
    input.value = atual || '#ffffff';
  }

  function rotular() {
    for (const b of botoes) b.setAttribute('aria-label', b.dataset.cor || t('original'));
    livre.setAttribute('aria-label', t('livre'));
    input.setAttribute('aria-label', t('livre'));
  }

  return { marcar, rotular };
}

const amCorpo = montarAmostras($('#amostras-corpo'), CORES_CORPO, 'cor', aplicarCorpo);
const amLuzes = montarAmostras($('#amostras-luzes'), CORES_LUZES, 'luzes', aplicarLuzes);

const brilho = $('#brilho'), velocidade = $('#velocidade'), girar = $('#girar');

// o trilho preenchido ate o polegar (webkit nao tem ::progress)
function pintarTrilho(r) {
  r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
}

function sincronizarControles() {
  amCorpo.marcar();
  amLuzes.marcar();
  brilho.value = estado.brilho;
  $('#brilho-v').textContent = `${Math.round((estado.brilho / 1.5) * 100)}%`;
  velocidade.value = estado.velocidade;
  $('#velocidade-v').textContent = `${Math.round(estado.velocidade)}°/s`;
  // velocidade so existe com o giro ligado: fora disso fica indisponivel, nao some
  velocidade.disabled = !estado.girando;
  $('label[for="velocidade"]').classList.toggle('off', !estado.girando);
  // restaurar indisponivel enquanto nada mudou
  $('#restaurar').disabled = Object.keys(PADRAO).every((k) => estado[k] === PADRAO[k]);
  girar.setAttribute('aria-checked', String(estado.girando));
  pintarTrilho(brilho);
  pintarTrilho(velocidade);
}

brilho.addEventListener('input', () => {
  estado.brilho = parseFloat(brilho.value); aplicarBrilho(); sincronizarControles(); sujo = true;
});
velocidade.addEventListener('input', () => {
  estado.velocidade = parseFloat(velocidade.value); sincronizarControles();
});
girar.addEventListener('click', () => {
  estado.girando = !estado.girando; sincronizarControles();
});
$('#restaurar').addEventListener('click', () => {
  Object.assign(estado, PADRAO);
  aplicarCorpo(); aplicarLuzes(); aplicarBrilho();
  sincronizarControles();
  sujo = true;
});

function traduzir() {
  document.documentElement.lang = idioma === 'pt' ? 'pt-BR' : 'en';
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === idioma)));
  $('#abrir').setAttribute('aria-label', t('abrir'));
  $('#fechar').setAttribute('aria-label', t('fechar'));
  canvas.setAttribute('aria-label', t('canvas'));
  amCorpo.rotular();
  amLuzes.rotular();
}

document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  idioma = b.dataset.lang;
  gravarLocal('boto-lang', idioma);
  traduzir();
}));

function abrirPainel(abrir) {
  document.body.classList.toggle('painel-aberto', abrir);
  $('#abrir').setAttribute('aria-expanded', String(abrir));
  if (abrir) { esconderDica(); $('#fechar').focus(); } else $('#abrir').focus();
}
$('#abrir').addEventListener('click', () => abrirPainel(true));
$('#fechar').addEventListener('click', () => abrirPainel(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('painel-aberto')) abrirPainel(false);
});

if (url.get('ui') === '0') { $('#abrir').hidden = true; $('#painel').hidden = true; }

traduzir();
sincronizarControles();
