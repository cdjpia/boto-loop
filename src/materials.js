import * as THREE from 'three';

// Sem UV e sem textura, o chapeado sai por cor de vertice: cada triangulo da malha
// decimada recebe uma cor inteira - magenta, aco escovado ou bronze - com uma
// variacao de brilho por chapa fazendo as vezes de desgaste. Com flatShading e o
// envMap por cima, isso le como placa metalica rebitada.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Espera geometria JA convertida com toNonIndexed(): cada 3 vertices = 1 triangulo
// independente, entao da pra pintar chapa por chapa.
export function paintPanels(geometry, P) {
  const pos = geometry.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  // Cores construidas a partir de string sRGB -> ja chegam no espaco linear de
  // trabalho. Por isso o material fica com color branco: quem carrega a cor do
  // corpo e o atributo, e multiplicar os dois escureceria tudo.
  const magenta = new THREE.Color(P.cor);
  const aco = new THREE.Color(P.corAco);
  const bronze = new THREE.Color(P.corBronze);

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const yTop = bb.max.y;
  const altura = bb.max.y - bb.min.y;
  const xMin = bb.min.x, xMax = bb.max.x;

  const rnd = mulberry32(P.seed);
  const c = new THREE.Color();

  for (let t = 0; t < count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;

    // Crista dorsal: faixa estreita no topo, onde correm os bulbos ambar.
    const naCrista = cy > yTop - 0.085 * altura && Math.abs(cz) < 0.13;

    // O aco domina em direcao ao bico (-X), como na referencia: cabeca e rostro
    // metalicos, corpo magenta.
    const rumoAoBico = 1 - smoothstep(xMin, xMax, cx);
    const pAco = Math.min(0.95, P.fracaoAco + P.viesCabeca * rumoAoBico * rumoAoBico);

    if (naCrista) c.copy(bronze);
    else if (rnd() < pAco) c.copy(aco);
    else c.copy(magenta);

    const desgaste = 0.80 + rnd() * 0.30;
    const r = c.r * desgaste, g = c.g * desgaste, b = c.b * desgaste;

    for (let k = 0; k < 3; k++) {
      colors[(t + k) * 3] = r;
      colors[(t + k) * 3 + 1] = g;
      colors[(t + k) * 3 + 2] = b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.attributes.color.needsUpdate = true;
}

export function bodyMaterial(P) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,          // a cor real vem do atributo de vertice
    vertexColors: true,
    metalness: P.metalness,
    roughness: P.roughness,
    clearcoat: P.clearcoat,
    clearcoatRoughness: 0.18,
    envMapIntensity: P.envMap,
    flatShading: true,
    side: THREE.FrontSide,    // corpo fechado: backface so lavaria a cor
  });
}
