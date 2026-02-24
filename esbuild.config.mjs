import esbuild from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const watch = process.argv.includes('--watch');
const rootDir = path.dirname(fileURLToPath(import.meta.url));

const OCR_ASSET_COPIES = [
  {
    from: 'node_modules/tesseract.js/dist/worker.min.js',
    to: 'assets/ocr/worker.min.js'
  },
  {
    from: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
    to: 'assets/ocr/tesseract-core-lstm.wasm.js'
  },
  {
    from: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm',
    to: 'assets/ocr/tesseract-core-lstm.wasm'
  },
  {
    from: 'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz',
    to: 'assets/ocr/eng.traineddata.gz'
  }
];

async function syncOcrAssets() {
  await mkdir(path.join(rootDir, 'assets/ocr'), { recursive: true });

  await Promise.all(
    OCR_ASSET_COPIES.map(async ({ from, to }) => {
      await copyFile(path.join(rootDir, from), path.join(rootDir, to));
    })
  );
}

const shared = {
  bundle: true,
  target: ['chrome110'],
  sourcemap: false,
  outdir: '.',
  logLevel: 'info'
};

const extensionConfig = {
  ...shared,
  entryPoints: {
    'content-script': 'src/content/index.ts',
    popup: 'src/popup/index.ts',
    background: 'src/background/index.ts'
  },
  format: 'iife',
};

const sanitizerConfig = {
  ...shared,
  entryPoints: {
    sanitizer: 'src/sanitizer/index.ts',
    'pdf-redaction-worker': 'src/shared/file/redaction/pdf/worker.ts'
  },
  format: 'esm',
  splitting: true,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]'
};

if (watch) {
  await syncOcrAssets();
  const extensionCtx = await esbuild.context(extensionConfig);
  const sanitizerCtx = await esbuild.context(sanitizerConfig);
  await extensionCtx.watch();
  await sanitizerCtx.watch();
  console.log('Watching TypeScript entrypoints and using local OCR assets...');
} else {
  await syncOcrAssets();
  await esbuild.build(extensionConfig);
  await esbuild.build(sanitizerConfig);
}
