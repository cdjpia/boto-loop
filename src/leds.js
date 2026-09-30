import * as THREE from 'three';

// Os LEDs sao geometria propria, nao emissao do material do casco - assim eles
// acendem com valor acima de 1 em linear e sao os unicos a cruzar o threshold do
// bloom. Coordenadas em espaco do modelo: -X bico, +X cauda, +Y dorso, +-Z laterais.

function emissivo(cfg) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: true, side: THREE.DoubleSide });
  aplicarCor(m, cfg);
  return m;
}

// Cor sRGB -> linear, multiplicada pela intensidade. Passar de 1.0 e o que faz o
// LED estourar o threshold de 0.85 do UnrealBloomPass; abaixo disso nao acende.
export function aplicarCor(material, cfg) {
  material.color.set(cfg.cor).multiplyScalar(cfg.intensidade);
}

export function buildLeds(LEDS) {
  const root = new THREE.Group();
  root.name = 'leds';

  const esfera = new THREE.SphereGeometry(1, 16, 12);
  const plano = new THREE.PlaneGeometry(1, 1);
  const caixa = new THREE.BoxGeometry(1, 1, 1);

  const grupos = {};

  // --- olhos: par de esferas, espelhado em Z ---
  const olhos = new THREE.Group();
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(esfera, emissivo(LEDS.olhos));
    m.userData.espelho = s;
    olhos.add(m);
  }
  grupos.olhos = olhos;

  // --- boca: caixa achatada dentro da cabeca, vazando pelo bico. Caixa e nao plano
  //     de proposito: num loop de 360 um plano some quando fica de perfil. ---
  const boca = new THREE.Group();
  boca.add(new THREE.Mesh(caixa, emissivo(LEDS.boca)));
  grupos.boca = boca;

  // --- nadadeiras: dois paineis planos, espelhados em Z ---
  const nadadeiras = new THREE.Group();
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(plano, emissivo(LEDS.nadadeiras));
    m.userData.espelho = s;
    nadadeiras.add(m);
  }
  grupos.nadadeiras = nadadeiras;

  // --- dorso: fileira de bulbos ambar. Contagem e espacamento sao parametros,
  //     entao o grupo e reconstruido quando mudam. ---
  const dorso = new THREE.Group();
  grupos.dorso = dorso;

  for (const g of Object.values(grupos)) root.add(g);

  const api = {
    root,
    grupos,
    perfilDorsal: null, // (x) => y do topo das costas; preenchido apos carregar a malha
    materiais: {
      olhos: olhos.children[0].material,
      boca: boca.children[0].material,
      nadadeiras: nadadeiras.children[0].material,
      dorso: emissivo(LEDS.dorso),
    },
    rebuildDorso() {
      for (const m of [...dorso.children]) { dorso.remove(m); m.geometry.dispose?.(); }
      const cfg = LEDS.dorso;
      const n = Math.max(1, Math.round(cfg.contagem));
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(esfera, api.materiais.dorso);
        m.userData.i = i;
        dorso.add(m);
      }
      api.sync(LEDS);
    },
    // Reposiciona tudo a partir dos parametros. Chamado a cada mudanca da GUI.
    sync(L) {
      // olhos
      for (const m of olhos.children) {
        const s = m.userData.espelho;
        m.position.set(L.olhos.x, L.olhos.y, L.olhos.z * s);
        m.scale.setScalar(L.olhos.escala);
      }
      olhos.visible = L.olhos.visivel;

      // boca
      const b = boca.children[0];
      b.position.set(L.boca.x, L.boca.y, L.boca.z);
      b.scale.set(L.boca.comprimento, L.boca.altura, L.boca.largura).multiplyScalar(L.boca.escala);
      boca.visible = L.boca.visivel;

      // nadadeiras
      for (const m of nadadeiras.children) {
        const s = m.userData.espelho;
        m.position.set(L.nadadeiras.x, L.nadadeiras.y, L.nadadeiras.z * s);
        m.scale.set(L.nadadeiras.comprimento, L.nadadeiras.altura, 1).multiplyScalar(L.nadadeiras.escala);
        m.rotation.set(0, 0, THREE.MathUtils.degToRad(L.nadadeiras.inclinacao) * s);
      }
      nadadeiras.visible = L.nadadeiras.visivel;

      // dorso: fileira ao longo de X. Com seguirDorso ligado, cada bulbo assenta na
      // linha real das costas amostrada da malha (que cai de y 0.44 no peito pra
      // 0.17 perto da cauda) e `y` vira a folga acima dela. Uma parabola simetrica
      // nao acompanha esse perfil - o bicho e mais alto na frente.
      const cfg = L.dorso;
      const n = dorso.children.length;
      for (const m of dorso.children) {
        const i = m.userData.i;
        const t = n > 1 ? i / (n - 1) - 0.5 : 0;
        const x = cfg.x + t * cfg.espacamento * (n - 1);
        const y = (cfg.seguirDorso && api.perfilDorsal)
          ? api.perfilDorsal(x) + cfg.y
          : cfg.y - cfg.curva * (t * 2) * (t * 2);
        m.position.set(x, y, cfg.z);
        m.scale.setScalar(cfg.raio * cfg.escala);
      }
      dorso.visible = cfg.visivel;
    },
  };

  api.rebuildDorso();
  return api;
}
