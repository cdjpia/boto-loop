import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { P, LEDS } from './params.js';
import { paintPanels, bodyMaterial } from './materials.js';
import { buildLeds } from './leds.js';
import { fitDistance, poseMatrix } from './framing.js';
import { montarGUI } from './gui.js';
import { criarAmbiente, criarComposer, amostrarDorso, pontosDeEnquadramento } from './pipeline.js';

const DEG = THREE.MathUtils.degToRad;
const canvas = document.getElementById('view');
const stage = document.getElementById('stage');
const hud = document.getElementById('hud');

// ---------------------------------------------------------------- renderer

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true, // sem isso o toBlob do export sai preto
});
renderer.setPixelRatio(1); // o buffer E a resolucao de export, nada de DPR
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(P.resolucao, P.resolucao, false);

const scene = new THREE.Scene();
scene.background = null;

// Camera fixa e NIVELADA: y = 0, olhando pra origem. Sem plongee, como no hero.
// Em +Z olhando pra -Z, o +X do mundo cai a direita da tela - entao o bico (-X do
// modelo) fica a esquerda com yaw 0, que e a convencao usada nos parametros.
const camera = new THREE.PerspectiveCamera(P.fov, 1, 0.01, 100);
camera.position.set(0, 0, 4);
camera.lookAt(0, 0, 0);

const { luzKey, luzRim } = criarAmbiente(renderer, scene, P);

// ---------------------------------------------------------------- hierarquia
// spinGroup   -> gira 360 no eixo Y do MUNDO
//   tiltGroup -> rotation.x = pitch
//     modelo  -> rotation.y = yaw, rotation.z = roll
//     leds    -> espelham a rotacao do modelo, pra ficarem colados na malha

const spinGroup = new THREE.Group();
const tiltGroup = new THREE.Group();
spinGroup.add(tiltGroup);
scene.add(spinGroup);

const leds = buildLeds(LEDS);
tiltGroup.add(leds.root);

let modelo = null;
let material = null;
let pontosCorpo = null; // posicoes indexadas do casco, pro calculo de enquadramento
let pontosFit = null;   // casco + cantos dos LEDs

// ---------------------------------------------------------------- composer

// Bloom com o alpha preservado + passe do halo: ver pipeline.js.
const { composer, bloom, alphaPass } = criarComposer(renderer, scene, camera, P, P.resolucao, P.resolucao);

// ---------------------------------------------------------------- carga

new GLTFLoader().load('./boto_low.glb', (gltf) => {
  const src = gltf.scene.getObjectByProperty('type', 'Mesh');
  let geo = src.geometry;

  // Guarda as posicoes ANTES do toNonIndexed: 2.2k vertices unicos em vez de 13k,
  // e o enquadramento e recalculado a cada frame.
  pontosCorpo = new Float32Array(geo.attributes.position.array);

  // Sem normais, sem UV: desindexar e recalcular da o flat shading facetado, cada
  // triangulo com sua propria normal. E o que faz aparecer a chapa.
  // Nao recentramos: a malha ja vem centrada na origem e as coordenadas dos LEDs
  // foram escolhidas contra essa bbox.
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();

  material = bodyMaterial(P);
  paintPanels(geo, P);

  modelo = new THREE.Mesh(geo, material);
  aplicarPose();
  tiltGroup.add(modelo);

  leds.perfilDorsal = amostrarDorso(geo);
  leds.sync(LEDS);

  refazerFit();
  montarGUI({ P, LEDS, app });
  hud.textContent = '';
  loop();
}, undefined, (err) => {
  hud.innerHTML = `<b>falhou ao carregar ./boto_low.glb</b>\nrode:  ./scripts/decimate.sh\n${err?.message ?? err}`;
});

// ---------------------------------------------------------------- pose

function aplicarPose() {
  // ATENCAO AO SINAL: com o modelo em yaw +90 o bico aponta pra +Z, e nessa
  // condicao rotation.x POSITIVO abaixa o bico. O slider da GUI se chama
  // "bico pra cima", entao a inversao mora aqui e so aqui.
  tiltGroup.rotation.x = -DEG(P.bicoUp);
  if (!modelo) return;
  modelo.rotation.set(0, DEG(P.yaw), DEG(P.roll), 'XYZ');
  leds.root.rotation.copy(modelo.rotation);
}

// ---------------------------------------------------------------- enquadramento

// Os bulbos do dorso passam da linha das costas, entao o enquadramento leva os
// LEDs em conta - ver pontosDeEnquadramento no pipeline.js.
function refazerFit() {
  if (!pontosCorpo) return;
  pontosFit = pontosDeEnquadramento(pontosCorpo, leds.root);
}

function atualizarCamera() {
  if (!pontosFit) return;
  const tan = Math.tan(DEG(P.fov) / 2);
  const pitch = -DEG(P.bicoUp), yaw = DEG(P.yaw), roll = DEG(P.roll);

  // distancia fixa = enquadrada na pose base (spin 0). Girando, a silhueta cresce
  // e o boto sangra pelas bordas - e esse o efeito de compensacao 0.
  const dFixo = fitDistance(pontosFit, poseMatrix(0, pitch, yaw, roll), tan, tan, P.preenchimento);
  // distancia por frame = tamanho aparente constante ao longo da volta inteira.
  const dDin = fitDistance(pontosFit, poseMatrix(DEG(P.spin), pitch, yaw, roll), tan, tan, P.preenchimento);

  camera.fov = P.fov;
  camera.position.set(0, 0, THREE.MathUtils.lerp(dFixo, dDin, P.compensacao));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- render

function renderFrame(spinGraus) {
  P.spin = ((spinGraus % 360) + 360) % 360;
  spinGroup.rotation.y = DEG(P.spin);
  aplicarPose();
  atualizarCamera();
  composer.render();
}

let ultimo = performance.now();
let exportando = false;

function loop() {
  requestAnimationFrame(loop);
  const agora = performance.now();
  const dt = Math.min(0.1, (agora - ultimo) / 1000);
  ultimo = agora;
  if (exportando) return;
  if (P.girando) P.spin += P.sentido * P.velocidade * dt;
  renderFrame(P.spin);
}

// ---------------------------------------------------------------- app

const app = {
  canvas, renderer, composer, bloom, camera, scene,
  leds, spinGroup, tiltGroup,
  get modelo() { return modelo; },
  get material() { return material; },
  renderFrame,
  refazerFit,
  aplicarPose,

  setExportando(v) { exportando = v; },

  setResolucao(r) {
    P.resolucao = r;
    renderer.setSize(r, r, false);
    composer.setSize(r, r);
    renderFrame(P.spin);
  },

  repintar() {
    if (!modelo) return;
    paintPanels(modelo.geometry, P);
  },

  atualizarMaterial() {
    if (!material) return;
    material.metalness = P.metalness;
    material.roughness = P.roughness;
    material.clearcoat = P.clearcoat;
    material.envMapIntensity = P.envMap;
    material.needsUpdate = true;
  },

  atualizarLuz() {
    luzKey.intensity = P.luzKey;
    luzRim.intensity = P.luzRim;
  },

  atualizarBloom() {
    bloom.strength = P.bloomForca;
    bloom.threshold = P.bloomThreshold;
    bloom.radius = P.bloomRaio;
    alphaPass.uniforms.ganho.value = P.alphaBrilho;
  },

  atualizarFundoTeste() {
    stage.classList.toggle('solido', P.fundoTeste);
    stage.style.backgroundColor = P.fundoTeste ? P.corFundoTeste : '';
    stage.style.setProperty('--guias', P.guias ? '1' : '0');
  },

  hud(txt) { hud.innerHTML = txt; },
};

window.app = app; // conveniencia pra inspecionar no console
