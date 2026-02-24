import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const config = {
  entryPoints: {
    'content-script': 'src/content/index.ts',
    popup: 'src/popup/index.ts',
    sanitizer: 'src/sanitizer/index.ts'
  },
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  sourcemap: false,
  outdir: '.',
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('Watching TypeScript entrypoints...');
} else {
  await esbuild.build(config);
}
