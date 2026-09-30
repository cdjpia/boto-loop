import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Tudo o que o editor (main.js) e o widget (widget.js) montam igual: environment,
// luzes e o composer com o bloom que preserva o alpha. Fica aqui pra correcao do
// alpha morar num lugar so.

export function criarAmbiente(renderer, scene, P) {
  // Environment map obrigatorio: sem ele o metal vira plastico fosco e o giro perde
  // a graca - o que se move na chapa e o reflexo, nao a luz.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const luzKey = new THREE.DirectionalLight(0xfff0e6, P.luzKey);
  luzKey.position.set(-1.6, 1.8, 2.4);
  const luzRim = new THREE.DirectionalLight(0x9fd8ff, P.luzRim);
  luzRim.position.set(1.6, 0.7, -2.2);
  scene.add(luzKey, luzRim);
  return { luzKey, luzRim };
}

export function criarComposer(renderer, scene, camera, P, largura, altura) {
  const composer = new EffectComposer(renderer);
  composer.setSize(largura, altura);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(largura, altura),
    P.bloomForca, P.bloomRaio, P.bloomThreshold,
  );

  // O UnrealBloomPass destroi o canal alpha: o shader de blur dele grava alpha 1.0
  // fixo, e o composite aditivo soma isso no frame inteiro - o fundo transparente
  // vira preto opaco. Trocamos o blend por CustomBlending com o alpha intocado
  // (src*0 + dst*1), preservando exatamente o alpha da cena.
  const mc = bloom.blendMaterial ?? bloom.materialCopy; // renomeado ao longo das versoes do three
  mc.blending = THREE.CustomBlending;
  mc.blendEquation = THREE.AddEquation;
  mc.blendSrc = THREE.SrcAlphaFactor;   // igual ao AdditiveBlending, no RGB
  mc.blendDst = THREE.OneFactor;
  mc.blendEquationAlpha = THREE.AddEquation;
  mc.blendSrcAlpha = THREE.ZeroFactor;
  mc.blendDstAlpha = THREE.OneFactor;

  composer.addPass(bloom);

  // OutputPass no fim: como a cena e renderizada pra render target, o tone mapping
  // nao acontece no shader do material. Quem aplica ACES + sRGB e este passe - e o
  // bloom, por vir antes, opera em HDR linear, que e a ordem certa.
  composer.addPass(new OutputPass());

  // Com o alpha do bloom neutralizado acima, o halo que vaza pra fora da silhueta
  // ficaria invisivel no PNG transparente. Este passe devolve alpha pro halo a
  // partir do proprio brilho dele. Usar o canal maximo garante rgb <= alpha, que e
  // o que o canvas premultiplicado espera - o halo composita como brilho aditivo.
  const alphaPass = new ShaderPass({
    // corte: 0 no editor (export intacto). O widget sobe isso pra aparar a cauda
    // fraca do bloom, que sobre um fundo colorido de pagina vira uma nuvem palida.
    uniforms: { tDiffuse: { value: null }, ganho: { value: P.alphaBrilho }, corte: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float ganho; uniform float corte; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        // so fora do corpo (alpha da cena < 1): brilho abaixo do corte some
        if (corte > 0.0) {
          float b0 = max(c.r, max(c.g, c.b));
          c.rgb *= mix(smoothstep(corte, corte * 2.0, b0), 1.0, c.a);
        }
        // c.rgb ja veio codificado em sRGB pelo OutputPass, e sRGB levanta muito os
        // escuros: a cauda fraquissima do bloom viraria um veu de alpha no quadro
        // inteiro. O quadrado desfaz grosso modo essa curva e recorta esse veu,
        // mantendo o halo onde ele de fato brilha.
        float brilho = max(c.r, max(c.g, c.b));
        float halo = brilho * brilho * ganho;
        gl_FragColor = vec4(c.rgb, clamp(max(c.a, halo), 0.0, 1.0));
      }`,
  });
  composer.addPass(alphaPass);

  return { composer, bloom, alphaPass };
}

// Linha das costas amostrada da propria malha: y maximo por faixa de x, olhando so
// a tira central (|z| pequeno) pra nao pegar o topo das nadadeiras. Serve pra
// assentar os bulbos do dorso na curva real em vez de numa aproximacao.
export function amostrarDorso(geo, passo = 0.05, faixaZ = 0.15) {
  const pos = geo.attributes.position;
  const baldes = new Map();
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i)) > faixaZ) continue;
    const k = Math.round(pos.getX(i) / passo);
    const y = pos.getY(i);
    if (!baldes.has(k) || y > baldes.get(k)) baldes.set(k, y);
  }
  const chaves = [...baldes.keys()].sort((a, b) => a - b);
  if (!chaves.length) return null;

  return (x) => {
    const k = x / passo;
    const k0 = Math.max(chaves[0], Math.min(chaves[chaves.length - 1], Math.floor(k)));
    const k1 = Math.min(chaves[chaves.length - 1], k0 + 1);
    const y0 = baldes.get(k0) ?? baldes.get(chaves[0]);
    const y1 = baldes.get(k1) ?? y0;
    return THREE.MathUtils.lerp(y0, y1, THREE.MathUtils.clamp(k - k0, 0, 1));
  };
}

// Casco (posicoes indexadas, 2.2k pontos) + os 8 cantos da caixa de cada LED
// visivel. Os bulbos do dorso passam da linha das costas, entao entram no calculo.
const _bb = new THREE.Box3();

export function pontosDeEnquadramento(pontosCorpo, ledsRoot) {
  const led = [];
  ledsRoot.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.parent.visible) return;
    o.updateMatrix();
    _bb.setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(o.matrix);
    for (const x of [_bb.min.x, _bb.max.x])
      for (const y of [_bb.min.y, _bb.max.y])
        for (const z of [_bb.min.z, _bb.max.z]) led.push(x, y, z);
  });
  const out = new Float32Array(pontosCorpo.length + led.length);
  out.set(pontosCorpo, 0);
  out.set(led, pontosCorpo.length);
  return out;
}
