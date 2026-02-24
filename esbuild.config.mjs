import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

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
    popup: 'src/popup/index.ts'
  },
  format: 'iife',
};

const sanitizerConfig = {
  ...shared,
  entryPoints: {
    sanitizer: 'src/sanitizer/index.ts'
  },
  format: 'esm',
  splitting: true,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]'
};

if (watch) {
  const extensionCtx = await esbuild.context(extensionConfig);
  const sanitizerCtx = await esbuild.context(sanitizerConfig);
  await extensionCtx.watch();
  await sanitizerCtx.watch();
  console.log('Watching TypeScript entrypoints...');
} else {
  await esbuild.build(extensionConfig);
  await esbuild.build(sanitizerConfig);
}
