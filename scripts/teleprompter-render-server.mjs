#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'localhost';
const OUTPUT_DIR = join(tmpdir(), 'jupitrr-teleprompter-render');
const renderedFiles = new Map();
const FONT_PATHS = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
];

function json(res, status, body) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body));
}

function logRequest(req, status, detail = '') {
  const suffix = detail ? ` ${detail}` : '';
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${status}${suffix}`);
}

function logRenderPayload(payload, id) {
  const width = Number(payload?.width) || 0;
  const height = Number(payload?.height) || 0;
  console.log(
    `${new Date().toISOString()} render ${id} requested ${width}x${height} text="${String(
      payload?.text ?? ''
    )
      .slice(0, 40)
      .replace(/\s+/g, ' ')}"`
  );
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body is too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function wrapText(text, maxCharsPerLine) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }

  if (line) lines.push(line);
  return lines.join('\n') || ' ';
}

function filterEscape(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function renderTeleprompter(payload) {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const id = randomUUID();
  const width = Math.max(320, Math.min(1920, Number(payload.width) || 720));
  const height = Math.max(320, Math.min(1920, Number(payload.height) || 1280));
  const durationSeconds = Math.max(6, Math.min(300, Number(payload.durationSeconds) || 20));
  const preparationDelaySeconds = Math.max(
    0,
    Math.min(60, Number(payload.preparationDelaySeconds) || 0)
  );
  const fontSize = Math.max(18, Math.min(96, Number(payload.textSize) || 32));
  const scrollSpeed = Math.max(20, Math.min(260, Number(payload.scrollSpeed) || 60));
  const layoutWidth = Math.min(width, height);
  const maxCharsPerLine = Math.max(18, Math.floor(layoutWidth / (fontSize * 0.52)));
  const wrappedText = wrapText(payload.text, maxCharsPerLine);
  const textFile = join(OUTPUT_DIR, `${id}.txt`);
  const outputFile = join(OUTPUT_DIR, `${id}.mp4`);
  const fontFile = FONT_PATHS.find((path) => existsSync(path)) || FONT_PATHS[0];

  await writeFile(textFile, wrappedText, 'utf8');

  const safeTextFile = filterEscape(textFile);
  const safeFontFile = filterEscape(fontFile);
  const lineSpacing = Math.round(fontSize * 0.45);
  const scrollExpression = `(h*0.62)-max(0\\,t-${preparationDelaySeconds})*${scrollSpeed}`;
  const filter = [
    `color=c=#05070f:s=${width}x${height}:r=30:d=${durationSeconds}`,
    `drawbox=x=0:y=0:w=iw:h=ih:color=#05070f:t=fill`,
    `drawtext=fontfile='${safeFontFile}':textfile='${safeTextFile}':reload=0:fontcolor=white:fontsize=${fontSize}:line_spacing=${lineSpacing}:x=(w-text_w)/2:y='${scrollExpression}'`,
    `drawtext=fontfile='${safeFontFile}':text='${preparationDelaySeconds}s prep':fontcolor=#a5b4fc:fontsize=${Math.max(18, Math.round(fontSize * 0.45))}:x=40:y=40:enable='lt(t\\,${preparationDelaySeconds})'`,
    'format=yuv420p',
  ].join(',');

  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    filter,
    '-movflags',
    '+faststart',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    outputFile,
  ]);

  await rm(textFile, { force: true });
  renderedFiles.set(id, outputFile);
  return { id, outputFile, durationSeconds };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      logRequest(req, 204);
      json(res, 204, {});
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && req.url?.startsWith('/renders/')) {
      const fileName = req.url.split('/').pop() ?? '';
      const id = fileName.replace(/\.mp4$/i, '').replace(/[^a-f0-9-]/gi, '');
      const file = (id && renderedFiles.get(id)) || (id ? join(OUTPUT_DIR, `${id}.mp4`) : '');
      const exists = file ? existsSync(file) : false;
      if (!file || !exists) {
        logRequest(req, 404, file ? `missing ${file}` : 'missing id');
        json(res, 404, { error: 'Not found' });
        return;
      }
      const fileStat = await stat(file);
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'video/mp4',
        'Content-Length': fileStat.size,
      });
      if (req.method === 'GET') {
        const data = await readFile(file);
        res.end(data);
      } else {
        res.end();
      }
      logRequest(req, 200, `${fileStat.size} bytes ${file}`);
      return;
    }

    if (req.method === 'POST' && req.url === '/teleprompter/render') {
      const payload = await parseBody(req);
      const render = await renderTeleprompter(payload);
      logRenderPayload(payload, render.id);
      json(res, 200, {
        videoUrl: `http://${PUBLIC_HOST}:${PORT}/renders/${render.id}.mp4`,
        durationSeconds: render.durationSeconds,
      });
      logRequest(req, 200, render.id);
      return;
    }

    logRequest(req, 404);
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    logRequest(req, 500);
    json(res, 500, { error: error instanceof Error ? error.message : 'Internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Teleprompter renderer listening on http://${PUBLIC_HOST}:${PORT}`);
});
