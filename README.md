# boto-loop

Interactive 3D **boto-aparelhagem** — a low-poly metal river dolphin covered in LED
lights, built with three.js.

**Live widget:** https://cdjpia.github.io/boto-loop/

Made by **Lucas Preginato** ([@cdjpia](https://github.com/cdjpia)). Code under the
[MIT license](LICENSE).

## Widget (Framer)

`widget.html` is the web version. It fills whatever frame it's placed in — no fixed
ratio — with the boto always centered and the same size at every angle (framed for
its full rotation sweep, so nothing ever leaves the frame).

- **Rotate in any direction:** drag, scroll wheel / trackpad, or arrow keys. Auto-spin
  is on by default; an animated hand shows how the first time the widget is seen.
- **Adjustments** button (glow, auto-spin + speed, background: transparent / black /
  white). The panel stays tucked in it; opened, it slides in on the right side on
  landscape frames (desktop, tablet) and up from the bottom on portrait frames (phone).

In Framer, insert an **Embed** (HTML) and paste:

```html
<iframe src="https://cdjpia.github.io/boto-loop/" title="Boto Loop 3D" loading="lazy"
  allowtransparency="true" style="width:100%;height:100%;border:0;display:block;background:transparent;"></iframe>
```

Because dragging and scrolling rotate the boto, touches and wheel scrolls over the
widget don't scroll the page.

| parameter | example | effect |
|---|---|---|
| `bg` | `?bg=black` | background: `transparent` (default), `black`, `white` |
| `spin` | `?spin=0` | start without auto-spin |
| `speed` | `?speed=40` | spin speed, degrees/second |
| `glow` | `?glow=0.8` | bloom strength (0–1.5) |
| `hint` | `?hint=0` | skip the rotate animation |
| `ui` | `?ui=0` | hide the Adjustments button |

Local preview: `npm start` → http://localhost:5173/widget.html. Every push to `main`
republishes the site through `.github/workflows/pages.yml`.

---

## Editor e loop exportado

Loop de rotação do boto-aparelhagem. Cena three.js local, quadro quadrado, fundo
transparente, export de sequência PNG e finalização em ffmpeg.

```bash
npm install
./scripts/decimate.sh     # passo 0, gera boto_low.glb
npm start                 # http://localhost:5173
# ... ajusta na GUI, clica "exportar sequência"
./build.sh                # gera dist/boto_loop.{webm,apng,mp4}
```

## Passo 0 — decimação

`boto.glb` tem 88.746 vértices / 177.516 triângulos, só POSITION: sem normais, sem
UV, sem material, sem textura. Nessa densidade o flat shading fica liso e a
estética de chapa grande se perde inteira.

`./scripts/decimate.sh [RAZÃO] [ERRO]` roda `weld` + `simplify` (meshoptimizer)
pelo `@gltf-transform/cli` instalado localmente. O default `0.025` entrega:

```
177.516 → 4.436 triângulos   (2.206 vértices, 3,05 MB → 54 KB, bbox preservada)
```

O `weld` antes do `simplify` não é opcional: a malha vem sem índices e o
meshoptimizer não acha aresta compartilhada nenhuma sem costurar primeiro.

## Hierarquia

```
spinGroup      rotation.y = giro de 360° no eixo Y do MUNDO
  tiltGroup    rotation.x = pitch
    modelo     rotation.y = yaw inicial (+30° = pose do hero)
               rotation.z = roll (-2°)
    leds       espelham a rotação do modelo
```

Os LEDs são filhos do `tiltGroup`, num grupo próprio cuja rotação acompanha a do
modelo. Fossem filhos diretos sem esse espelho, mexer no yaw descolaria os LEDs
da malha.

### Sinal do pitch

Com o modelo em yaw +90° o bico aponta pra +Z, e nessa condição `rotation.x`
**positivo abaixa** o bico. O slider da GUI se chama **"bico pra cima"** e é
positivo pra cima — a inversão está em `aplicarPose()` no `main.js`, num lugar só.

## Enquadramento

A silhueta varia 41% ao girar (2,01 de largura em perfil, 1,18 de frente). Dois
controles:

- **compensação** `0..1` — 0 usa a distância da pose base, o boto pulsa e sangra
  pelas bordas no perfil; 1 recalcula a distância a cada frame. Interpolação
  linear. Medido: a variação de tamanho aparente cai de **1,74×** para **1,21×**
  na volta. O resíduo é perspectiva pura — o objeto não é plano, então "nada sai
  do quadro" não é a mesma coisa que "largura constante". Fov menor reduz.
- **preenchimento** — 1,0 encosta na borda, passa de 1,0 pra cortar de propósito.

A altura fica em ~0,92 contra ~2,01 de largura, então sobra ar em cima e embaixo.
É intencional: é onde entra a tipografia.

## Materiais

Sem UV não dá pra texturizar, então o chapeado sai por **cor de vértice por
triângulo**: magenta, aço escovado ou bronze na crista, com variação de brilho
fazendo as vezes de desgaste. O aço domina em direção ao bico. `flatShading` +
`RoomEnvironment` via `PMREMGenerator` fazem o resto — sem o environment map o
metal vira plástico e o giro perde o sentido, já que quem se move na chapa é o
reflexo.

O material fica com `color` branco de propósito: quem carrega a cor do corpo é o
atributo de vértice, e multiplicar os dois escureceria tudo.

### LEDs

Geometria própria, `MeshBasicMaterial` com a cor multiplicada pela intensidade
(valores acima de 1 em linear). A fileira do dorso assenta na **linha real das
costas**, amostrada da malha — o bicho é mais alto na frente (y 0,44) do que
perto da cauda (0,17), então nenhuma parábola simétrica encaixa.

O threshold do bloom usa **luminância**, não canal máximo: vermelho pesa 0,21 e
ciano ~0,79. Por isso a boca vermelha precisa de intensidade bem maior que as
nadadeiras pra acender igual.

## Transparência com bloom

O `UnrealBloomPass` destrói o canal alpha — o shader de blur dele grava `alpha
1.0` fixo e o composite aditivo espalha isso pelo quadro inteiro, deixando o
fundo preto opaco. Duas correções no `main.js`:

1. o blend do bloom vira `CustomBlending` com o alpha intocado (`src*0 + dst*1`);
2. um passe final devolve alpha pro halo a partir do próprio brilho, com curva
   quadrática — `c.rgb` já saiu do `OutputPass` codificado em sRGB, que levanta
   muito os escuros, e sem isso a cauda fraca do bloom vira um véu de alpha no
   quadro todo. Slider **"alpha do halo"** controla o quanto.

Resultado medido no PNG exportado: 47% do quadro com alpha exatamente 0, corpo
opaco em 255.

Ordem do composer: `RenderPass → UnrealBloomPass → OutputPass → alphaPass`. O
`OutputPass` no fim porque, renderizando pra render target, o three não aplica
tone mapping no shader do material — e o bloom, vindo antes, opera em HDR linear,
que é a ordem certa.

## Export

O botão **"exportar sequência"** renderiza **uma** volta de 360° em N frames e
grava `out/boto_0001.png…` direto pelo servidor local (`POST /api/frame`), que é o
que o `build.sh` consome. Sem servidor, cai pro download do navegador. A pasta é
limpa antes: sobra de uma corrida mais longa continua numerada na sequência e o
ffmpeg engoliria junto.

O último frame é `360 × (N-1)/N`, não 360 — senão o loop repete o primeiro frame e
trava por um quadro.

**"exportar frame atual"** sai em `escalaEstatico ×` a resolução, pra versão
estática.

## build.sh

```bash
./build.sh [FPS] [COR_DE_FUNDO] [TAMANHO_APNG]   # defaults: 30, 0x0E0E12, 640
```

| saída | formato |
|---|---|
| `dist/boto_loop.webm` | VP9 `yuva420p` com alpha, duas voltas |
| `dist/boto_loop.apng` | loop infinito (`-plays 0`), alpha |
| `dist/boto_loop.mp4`  | 1080×1080 sobre fundo sólido, duas voltas |

As duas voltas saem **repetindo os mesmos 360°** — concat do mesmo arquivo duas
vezes, sem recodificar. A cena nunca renderiza 720°.

O APNG leva só uma volta: o formato já repete pra sempre. E não comprime vídeo —
por isso o parâmetro de tamanho; em 1440 um loop de 60 frames passa fácil de 100 MB.

> `ffprobe` reporta o WebM como `yuv420p` e o decoder do ffmpeg descarta o alpha:
> o VP9 guarda alpha em BlockAdditions, que o ffmpeg escreve (`alpha_mode=1`) mas
> não lê de volta. Quem lê é o navegador — verificado em `<video>` sobre xadrez.

## Arquivos

```
boto.glb              malha original (cópia de ref/boto update.glb)
boto_low.glb          gerado pelo passo 0
scripts/decimate.sh   passo 0
scripts/glbinfo.mjs   contagem de vértices/triângulos/bbox de um .glb
server.mjs            estáticos + POST /api/frame e /api/clear
src/params.js         todo o estado da cena num lugar só
src/main.js           renderer, hierarquia, composer, enquadramento
src/materials.js      chapeado procedural por cor de vértice
src/leds.js           grupos de LED e o perfil dorsal
src/framing.js        cálculo de distância da câmera
src/exporter.js       sequência PNG
src/gui.js            lil-gui
src/pipeline.js       environment, luzes e composer com alpha (editor + widget)
src/widget.js         widget publicado: giro livre, botao de ajustes, enquadramento fixo
widget.html           página do widget (three pelo CDN)
build.sh              ffmpeg
```
