#!/usr/bin/env bash
# Monta os entregaveis a partir da sequencia de PNG em ./out/.
#
#   ./build.sh [FPS] [COR_DE_FUNDO] [TAMANHO_APNG]
#
#   FPS            default 30
#   COR_DE_FUNDO   cor solida do MP4, nome ou hex ffmpeg (default 0x0E0E12)
#   TAMANHO_APNG   lado do APNG em px (default 640) - APNG nao comprime video,
#                  em 1440 um loop de 60 frames passa fácil de 100 MB
#
# Saidas em ./dist/:
#   boto_loop.webm   VP9 com alpha, duas voltas
#   boto_loop.apng   loop infinito, alpha
#   boto_loop.mp4    1080x1080 sobre fundo solido, duas voltas
#
# As duas voltas saem REPETINDO os mesmos 360 graus (concat do mesmo arquivo duas
# vezes, sem recodificar). A cena nunca renderiza 720 graus.
set -euo pipefail
cd "$(dirname "$0")"

FPS="${1:-30}"
BG="${2:-0x0E0E12}"
APNG_SIZE="${3:-640}"

IN_DIR="out"
PADRAO="$IN_DIR/boto_%04d.png"
DIST="dist"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v ffmpeg >/dev/null || { echo "ffmpeg nao encontrado (brew install ffmpeg)" >&2; exit 1; }

N=$(ls -1 "$IN_DIR"/boto_[0-9]*.png 2>/dev/null | wc -l | tr -d ' ')
if [ "$N" -lt 2 ]; then
  echo "nenhum frame em ./$IN_DIR — rode 'npm start' e use 'exportar sequência' na GUI" >&2
  exit 1
fi
mkdir -p "$DIST"
echo "==> $N frames a $FPS fps  (uma volta = $(echo "scale=2; $N/$FPS" | bc)s, saida = o dobro)"

# lista de concat: o mesmo arquivo duas vezes = duas voltas
dobrar() {
  local arq="$1" lista="$2"
  printf "file '%s'\nfile '%s'\n" "$(cd "$(dirname "$arq")" && pwd)/$(basename "$arq")" \
                                  "$(cd "$(dirname "$arq")" && pwd)/$(basename "$arq")" > "$lista"
}

# ---------------------------------------------------------------- (a) WebM VP9 alpha
echo
echo "==> (a) WebM VP9 com alpha"
# yuva420p e o unico pix_fmt de alpha do VP9. auto-alt-ref precisa ficar em 0:
# frames alternativos destroem o canal alpha.
ffmpeg -y -loglevel error \
  -framerate "$FPS" -i "$PADRAO" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 \
  -b:v 0 -crf 26 -row-mt 1 \
  "$TMP/volta.webm"

dobrar "$TMP/volta.webm" "$TMP/webm.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/webm.txt" -c copy "$DIST/boto_loop.webm"

# ---------------------------------------------------------------- (b) APNG loop infinito
echo
echo "==> (b) APNG (loop infinito, ${APNG_SIZE}px)"
# -plays 0 = infinito. Uma volta basta: o proprio formato repete pra sempre.
ffmpeg -y -loglevel error \
  -framerate "$FPS" -i "$PADRAO" \
  -vf "scale=${APNG_SIZE}:${APNG_SIZE}:flags=lanczos" \
  -plays 0 -f apng "$DIST/boto_loop.apng"

# ---------------------------------------------------------------- (c) MP4 fundo solido
echo
echo "==> (c) MP4 1080x1080 sobre $BG"
ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=${BG}:s=1080x1080:r=${FPS}" \
  -framerate "$FPS" -i "$PADRAO" \
  -filter_complex "[1:v]scale=1080:1080:flags=lanczos[fg];[0:v][fg]overlay=0:0:shortest=1,format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -movflags +faststart \
  "$TMP/volta.mp4"

dobrar "$TMP/volta.mp4" "$TMP/mp4.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/mp4.txt" -c copy "$DIST/boto_loop.mp4"

echo
echo "==> pronto"
ls -lh "$DIST"/boto_loop.* | awk '{printf "    %-24s %s\n", $9, $5}'
