#!/usr/bin/env node
// Servidor local: serve os estaticos (incluindo node_modules, de onde saem o three
// e o lil-gui pelo importmap) e recebe os PNGs do export em ./out/.
//
//   npm start        ->  http://localhost:5173

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const OUT = join(ROOT, 'out');
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const corpo = (req) => new Promise((res, rej) => {
  const p = [];
  req.on('data', (c) => p.push(c));
  req.on('end', () => res(Buffer.concat(p)));
  req.on('error', rej);
});

await mkdir(OUT, { recursive: true });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, out: OUT }));
  }

  // Grava um frame. O nome e higienizado: so o basename, so .png.
  if (url.pathname === '/api/frame' && req.method === 'POST') {
    const nome = (url.searchParams.get('name') || '').split(/[\\/]/).pop();
    if (!/^[\w.-]+\.png$/.test(nome)) {
      res.writeHead(400); return res.end('nome de arquivo invalido');
    }
    try {
      await writeFile(join(OUT, nome), await corpo(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, path: `out/${nome}` }));
    } catch (e) {
      res.writeHead(500); return res.end(String(e));
    }
  }

  // Limpa a pasta de frames antes de uma nova sequencia.
  if (url.pathname === '/api/clear' && req.method === 'POST') {
    const antigos = (await readdir(OUT)).filter((f) => f.endsWith('.png'));
    await Promise.all(antigos.map((f) => unlink(join(OUT, f))));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, removidos: antigos.length }));
  }

  // estaticos
  let caminho = decodeURIComponent(url.pathname);
  if (caminho === '/') caminho = '/index.html';
  const alvo = join(ROOT, normalize(caminho).replace(/^(\.\.[/\\])+/, ''));
  if (!alvo.startsWith(ROOT)) { res.writeHead(403); return res.end('fora da raiz'); }

  try {
    const dados = await readFile(alvo);
    res.writeHead(200, {
      'Content-Type': MIME[extname(alvo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(dados);
  } catch {
    res.writeHead(404); res.end('nao encontrado');
  }
}).listen(PORT, () => {
  console.log(`boto-loop  ->  http://localhost:${PORT}`);
  console.log(`frames     ->  ${OUT}`);
});
