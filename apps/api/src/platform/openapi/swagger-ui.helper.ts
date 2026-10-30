import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { FastifyReply } from 'fastify';
import { NotFoundException } from '@nestjs/common';

let cachedStaticDir: string | null = null;

export function getSwaggerUiStaticDir(): string {
  if (cachedStaticDir) return cachedStaticDir;
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve('@fastify/swagger-ui/package.json');
    cachedStaticDir = path.join(path.dirname(pkgPath), 'static');
    return cachedStaticDir;
  } catch {
    cachedStaticDir = path.resolve(process.cwd(), 'node_modules/@fastify/swagger-ui/static');
    return cachedStaticDir;
  }
}

export function isApiDocsEnabled(): boolean {
  if (process.env.API_DOCS_ENABLED !== undefined) {
    const val = process.env.API_DOCS_ENABLED.toLowerCase();
    return val === 'true' || val === '1';
  }
  return process.env.NODE_ENV !== 'production';
}

export function getSwaggerUiHtml(basePath = process.env.API_PUBLIC_BASE_PATH || '/'): string {
  const publicPrefix = basePath.replace(/\/+$/, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TRIMING IDMIS 2.0 API Docs</title>
  <link rel="stylesheet" type="text/css" href="${publicPrefix}/docs/static/swagger-ui.css" />
  <link rel="stylesheet" type="text/css" href="${publicPrefix}/docs/static/index.css" />
  <link rel="icon" type="image/png" href="${publicPrefix}/docs/static/favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="${publicPrefix}/docs/static/favicon-16x16.png" sizes="16x16" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .topbar .download-url-wrapper { display: none !important; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${publicPrefix}/docs/static/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="${publicPrefix}/docs/static/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${publicPrefix}/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true
      });
      window.ui = ui;
    };
  </script>
</body>
</html>`;
}

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function serveSwaggerUiStaticAsset(rawFilePath: string, res: FastifyReply) {
  const staticDir = getSwaggerUiStaticDir();
  const normalized = path.normalize(rawFilePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(staticDir, normalized);

  if (!fullPath.startsWith(staticDir) || !fs.existsSync(fullPath)) {
    throw new NotFoundException(`Asset not found: ${rawFilePath}`);
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    throw new NotFoundException(`Asset not found: ${rawFilePath}`);
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const content = fs.readFileSync(fullPath);
  res.header('content-type', contentType);
  res.header('cache-control', 'public, max-age=3600');
  return res.send(content);
}
