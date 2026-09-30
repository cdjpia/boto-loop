// Estado unico da cena. A GUI escreve aqui, o render le daqui.

export const HERO = { yaw: 30, bicoUp: 0, roll: -2 }; // pose medida no hero.jpg

export const P = {
  // --- pose (modelo, dentro do tiltGroup) ---
  yaw: HERO.yaw,       // graus, +30 = pose do hero. yaw 0 = perfil, bico a esquerda
  bicoUp: HERO.bicoUp, // graus, POSITIVO = bico pra cima (o sinal e invertido no render)
  roll: HERO.roll,     // graus

  // --- giro ---
  girando: true,
  sentido: 1,          // 1 = anti-horario visto de cima, -1 = horario
  velocidade: 24,      // graus por segundo, so no preview
  spin: 0,             // graus, angulo atual do spinGroup
  frames: 60,          // frames de UMA volta de 360 no export

  // --- enquadramento ---
  compensacao: 0,      // 0 = distancia fixa (pulsa), 1 = distancia por frame (tamanho constante)
  preenchimento: 0.90, // 1.0 = silhueta encosta na borda; >1 corta de proposito
  fov: 28,
  guias: false,

  // --- render ---
  resolucao: 1440,
  escalaEstatico: 2,   // multiplicador do "exportar frame atual"

  // --- bloom ---
  bloomForca: 0.45,
  bloomThreshold: 0.85, // alto: so o LED passa, o casco nao
  bloomRaio: 0.22,
  alphaBrilho: 1.0,    // quanto do halo do bloom vira alpha no PNG transparente

  // --- material do corpo ---
  cor: '#DF378B',
  corAco: '#8C9196',
  corBronze: '#B5762F',
  fracaoAco: 0.30,     // fracao de chapas em aco escovado
  viesCabeca: 0.40,    // quanto o aco domina em direcao ao bico
  metalness: 0.85,
  roughness: 0.25,
  clearcoat: 1.0,
  envMap: 0.85,
  seed: 1337,

  // --- luz ---
  luzKey: 0.75,
  luzRim: 1.30,

  // --- so tela, nunca entra no export ---
  fundoTeste: false,
  corFundoTeste: '#0E0E12',
};

// Cada grupo de LED: posicao XYZ em espaco do modelo (-X bico, +X cauda, +Y dorso),
// escala, cor e intensidade. A intensidade multiplica a cor pra passar do
// threshold do bloom - abaixo de ~1.0 em linear o LED nao acende. O threshold usa
// LUMINANCIA, nao o canal maximo: vermelho pesa 0.21 e ciano ~0.79, entao a boca
// vermelha precisa de intensidade bem maior que as nadadeiras pra acender igual.
export const LEDS = {
// Valores ancorados na anatomia medida da malha:
//   rostro   x -1.00..-0.65, muito fino (|z| 0.04..0.12), linha da boca em y ~ -0.06
//   cabeca   x -0.65..-0.30, |z| ate 0.25
//   nadadeira  x -0.20..0.03, |z| 0.25..0.61, y ate -0.45
//   dorso    ymax 0.44 na altura do peito caindo pra 0.17 perto da cauda
  olhos: {
    visivel: true, cor: '#FF8A1E', intensidade: 2.6,
    x: -0.470, y: 0.105, z: 0.185, escala: 0.046,
  },
  boca: {
    visivel: true, cor: '#FF3B0F', intensidade: 3.4,
    x: -0.740, y: -0.050, z: 0, escala: 1.0,
    comprimento: 0.36, altura: 0.030, largura: 0.075,
  },
  nadadeiras: {
    visivel: true, cor: '#00CFFF', intensidade: 2.0,
    x: -0.090, y: -0.220, z: 0.455, escala: 1.0,
    comprimento: 0.24, altura: 0.28, inclinacao: -20, // graus, no plano XY
  },
  dorso: {
    visivel: true, cor: '#FFA51E', intensidade: 2.8,
    // com seguirDorso ligado, y e a folga ACIMA da linha das costas, nao altura absoluta
    x: 0.190, y: 0.018, z: 0, escala: 1.0,
    contagem: 14, espacamento: 0.060, raio: 0.024, curva: 0.0,
    seguirDorso: true,
  },
};
