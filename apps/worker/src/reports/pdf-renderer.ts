import fs from 'node:fs';
import { chromium, type Browser } from 'playwright-core';

export function resolveChromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  const standardPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const candidate of standardPaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return process.env.CHROMIUM_PATH || undefined;
}

export interface RenderPdfOptions {
  timeoutMs?: number;
}

export async function renderHtmlToPdf(
  html: string,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const launchTimeoutMs = Math.max(timeoutMs, 60000);
  const executablePath = resolveChromiumPath();

  let browser: Browser | null = null;

  try {
    // Launch headless Chromium with security flags
    // Note: --no-sandbox is required in Docker containers without user namespace cloning privileges
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      timeout: launchTimeoutMs,
    });

    // Create an isolated context with JavaScript explicitly disabled
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });

    const page = await context.newPage();

    // Security route interception: strictly block ALL network requests except data: URIs
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('data:')) {
        void route.continue();
      } else {
        void route.abort('blockedbyclient');
      }
    });

    // Load HTML content
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: timeoutMs,
    });

    // Render to standard A4 PDF with background graphics enabled
    const pdfUint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        bottom: '15mm',
        left: '15mm',
        right: '15mm',
      },
    });

    return Buffer.from(pdfUint8Array);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
