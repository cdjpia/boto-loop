// Widget publicado (widget.html): o boto numa caixa de proporcao fixa (16:9 deitado,
// 3:5 em pe), palco de um lado e controles do outro - os controles nunca passam por
// cima do boto. Reaproveita a malha, o chapeado, os LEDs e o composer do editor;
// nada de export nem de lil-gui aqui.
//
// Parametros de URL, pra configurar pelo Embed do Framer:
//   ?bg=transparent|black|white   fundo da caixa (default transparent)
//   ?ui=0         esconde os controles (o palco ocupa a caixa toda)
//   ?hint=0       esconde a animacao "drag to rotate"
//   ?spin=1       comeca girando (default: parado)
//   ?speed=24     graus por segundo
//   ?glow=0.45    forca do bloom

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { P, LEDS } from './params.js';
import { paintPanels, bodyMaterial } from './materials.js';
import { buildLeds } from './leds.js';
import { fitDistance, poseMatrix } from './framing.js';
import { criarAmbiente, criarComposer, amostrarDorso, pontosDeEnquadramento } from './pipeline.js';

const DEG = THREE.MathUtils.degToRad;
const $ = (s) => document.querySelector(s);
const url = new URLSearchParams(location.search);

// ---------------------------------------------------------------- opcoes

const FUNDOS = [
  ['transparente', 'Transparent', 'xadrez'], ['preto', 'Black', '#000000'], ['branco', 'White', '#FFFFFF'],
];
const FUNDO_URL = { transparent: 'transparente', black: 'preto', white: 'branco' };

// ---------------------------------------------------------------- estado

const reduzMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const num = (v, min, max) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? THREE.MathUtils.clamp(n, min, max) : null;
};
const PADRAO = {
  // 27% no controle (0.405 de 1.5): um pouco abaixo do editor, o halo nao estoura na pagina
  brilho: num(url.get('glow'), 0, 1.5) ?? 0.405,
  girando: url.get('spin') === '1' && !reduzMovimento,
  velocidade: num(url.get('speed'), 4, 120) ?? P.velocidade,
  fundo: FUNDO_URL[url.get('bg')] ?? 'transparente',
};
const estado = { ...PADRAO };

// Preenchimento abaixo de 1 deixa espaco pro halo do bloom nao bater na borda do palco.
Object.assign(P, { preenchimento: 0.9 });

// ---------------------------------------------------------------- renderer

const caixa = $('#caixa');
const palco = $('#palco');
const canvas = $('#view');
if (url.get('ui') === '0') caixa.classList.add('sem-ui');

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

// O canvas acompanha o palco, nao a janela: a caixa muda de proporcao (16:9 / 3:5)
// e os controles comem uma parte dela.
let largura = 0, altura = 0;

function redimensionar() {
  const w = Math.max(1, Math.round(palco.clientWidth));
  const h = Math.max(1, Math.round(palco.clientHeight));
  if (w === largura && h === altura) return;
  largura = w; altura = h;
  // DPR ate 2: acima disso o bloom custa caro no celular e ninguem ve a diferenca.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  enquadrar();
}
new ResizeObserver(redimensionar).observe(palco);

// ---------------------------------------------------------------- enquadramento

// Diferente do editor, aqui a camera NAO acompanha o giro: o boto tem o mesmo
// tamanho o tempo todo. A distancia e a do pior caso da volta inteira (o perfil,
// mais largo), entao nenhum angulo sangra pra fora do palco. So muda quando o
// palco muda de tamanho.
let distancia = null;

function enquadrar() {
  if (!pontosFit) return;
  const tanV = Math.tan(DEG(P.fov) / 2);
  const tanH = tanV * camera.aspect;
  const pitch = -DEG(P.bicoUp), yaw = DEG(P.yaw), roll = DEG(P.roll);
  distancia = 0;
  for (let a = 0; a < 360; a += 5) {
    const d = fitDistance(pontosFit, poseMatrix(DEG(a), pitch, yaw, roll), tanH, tanV, P.preenchimento);
    if (d > distancia) distancia = d;
  }
  camera.fov = P.fov;
  camera.position.set(0, 0, distancia);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  sujo = true;
}

// ---------------------------------------------------------------- aparencia

function aplicarBrilho() { bloom.strength = estado.brilho; }

// fundo e CSS na caixa, atras do canvas transparente - o render nao muda
function aplicarFundo() { caixa.dataset.fundo = estado.fundo; }

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
  esconderDica();
  sujo = true;
});

// ---------------------------------------------------------------- dica

// A animacao toca na primeira vez que o widget aparece na tela - numa pagina do
// Framer ele costuma carregar la embaixo, fora da vista, e a dica se perderia.
const dica = $('#dica');
let dicaFeita = url.get('hint') === '0';
let dicaTimer = 0;

function mostrarDica() {
  if (dicaFeita || !modelo) return;
  dicaFeita = true;
  dica.classList.add('visivel');
  dicaTimer = setTimeout(esconderDica, 3300); // duas passadas de 1.5s + folga
}
function esconderDica() {
  dicaFeita = true;
  clearTimeout(dicaTimer);
  dica.classList.remove('visivel');
}

// ---------------------------------------------------------------- loop

// So renderiza quando o widget esta na tela: numa pagina do Framer ele passa a
// maior parte do tempo fora da vista. Aba escondida o proprio rAF ja pausa.
let naTela = true;
new IntersectionObserver(([en]) => {
  naTela = en.isIntersecting;
  if (naTela) mostrarDica();
}, { threshold: 0.4 }).observe(palco);

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

  paintPanels(geo, P);
  modelo = new THREE.Mesh(geo, bodyMaterial(P));
  tiltGroup.add(modelo);
  aplicarPose();

  leds.perfilDorsal = amostrarDorso(geo);
  leds.sync(LEDS);
  aplicarBrilho();
  pontosFit = pontosDeEnquadramento(pontosCorpo, leds.root);
  enquadrar();

  vel = alvo();
  sujo = true;
  requestAnimationFrame((ts) => { anterior = ts; loop(ts); });
  canvas.classList.add('pronto');
  if (naTela) setTimeout(mostrarDica, 500);
}, undefined, (err) => {
  console.error(err);
  const d = document.createElement('div');
  d.className = 'erro';
  d.textContent = 'Could not load the 3D model.';
  palco.append(d);
});

// ---------------------------------------------------------------- controles

function montarAmostras(el, opcoes, chave, aplicar) {
  const botoes = opcoes.map(([valor, nome, visual]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'amostra';
    const cor = visual ?? valor;
    if (cor === 'xadrez') b.classList.add('xadrez');
    else b.style.setProperty('--c', cor);
    b.setAttribute('aria-label', nome);
    b.title = nome;
    b.addEventListener('click', () => {
      estado[chave] = valor; aplicar(); sincronizarControles(); sujo = true;
    });
    el.append(b);
    return [valor, b];
  });
  return () => {
    for (const [valor, b] of botoes) b.setAttribute('aria-pressed', String(valor === estado[chave]));
  };
}

const marcarFundo = montarAmostras($('#amostras-fundo'), FUNDOS, 'fundo', aplicarFundo);

const brilho = $('#brilho'), velocidade = $('#velocidade'), girar = $('#girar');

// o trilho preenchido ate o polegar (webkit nao tem ::progress)
function pintarTrilho(r) {
  r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
}

function sincronizarControles() {
  marcarFundo();
  brilho.value = estado.brilho;
  $('#brilho-v').textContent = `${Math.round((estado.brilho / 1.5) * 100)}%`;
  velocidade.value = estado.velocidade;
  $('#velocidade-v').textContent = `${Math.round(estado.velocidade)}°/s`;
  // velocidade so existe com o giro ligado: fora disso fica indisponivel, nao some
  velocidade.disabled = !estado.girando;
  $('#r-giro').classList.toggle('off', !estado.girando);
  girar.setAttribute('aria-checked', String(estado.girando));
  $('#fundo-v').textContent = FUNDOS.find(([v]) => v === estado.fundo)[1];
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

aplicarFundo();
sincronizarControles();
