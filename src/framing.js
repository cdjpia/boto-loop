import * as THREE from 'three';

// A silhueta do boto varia 41% ao girar (2.01 de largura em perfil, 1.18 de frente).
// Numa camera de distancia fixa isso vira um pulso: o bicho cresce e sangra pelas
// bordas quando passa pelo perfil. Aqui a gente calcula, pra uma pose qualquer, a
// distancia exata em que a nuvem de pontos ainda cabe no frustum.
//
// Camera nivelada em (0, 0, d) olhando pra origem, entao o espaco de camera e o
// espaco do mundo com z deslocado. Um ponto (X, Y, Z) esta a uma profundidade
// (d - Z); a meia-largura visivel nessa profundidade e tan(fov/2) * (d - Z).
// Caber significa |X| <= fill * tanH * (d - Z), ou seja d >= Z + |X| / (fill * tanH).
// A distancia da pose e o maximo disso sobre todos os pontos.

const _v = new THREE.Vector3();

export function fitDistance(points, matrix, tanH, tanV, fill) {
  let d = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    _v.set(points[i], points[i + 1], points[i + 2]).applyMatrix4(matrix);
    const need = Math.max(Math.abs(_v.x) / (tanH * fill), Math.abs(_v.y) / (tanV * fill));
    const dd = _v.z + need;
    if (dd > d) d = dd;
  }
  return d;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();

// Reproduz spinGroup * tiltGroup * modelo sem tocar no grafo da cena, pra poder
// medir o enquadramento de qualquer angulo (inclusive de frames futuros).
export function poseMatrix(spinRad, pitchRad, yawRad, rollRad) {
  _m.makeRotationY(spinRad);
  _m.multiply(_t.makeRotationX(pitchRad));
  _e.set(0, yawRad, rollRad, 'XYZ');
  _m.multiply(_t.makeRotationFromQuaternion(_q.setFromEuler(_e)));
  return _m;
}

// Concatena as posicoes de varias geometrias num unico Float32Array, pra medir o
// enquadramento com o casco E os LEDs (os bulbos do dorso passam da linha das costas).
export function collectPoints(objects) {
  const arrays = [];
  let total = 0;
  const v = new THREE.Vector3();

  for (const obj of objects) {
    obj.updateMatrix();
    const pos = obj.geometry.attributes.position;
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrix);
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    arrays.push(out);
    total += out.length;
  }

  const points = new Float32Array(total);
  let o = 0;
  for (const a of arrays) { points.set(a, o); o += a.length; }
  return points;
}
