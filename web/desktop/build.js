import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
fs.mkdirSync(distDir, { recursive: true });

async function build() {
  console.log('Building Mellow Desktop...');
  
  // Build main process
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/main.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: path.join(distDir, 'main.js'),
    external: ['electron'],
    sourcemap: true,
  });

  // Build preload script
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/preload.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: path.join(distDir, 'preload.js'),
    external: ['electron'],
    sourcemap: true,
  });

  // Build spotify module
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/spotify.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: path.join(distDir, 'spotify.js'),
    sourcemap: true,
  });

  // Remove artifacts left by earlier builds which bundled Discord presence.
  for (const name of ['discordRpc.js', 'discordRpc.js.map']) {
    fs.rmSync(path.join(distDir, name), { force: true });
  }

  // Copy icons to dist
  const ico = path.join(__dirname, 'icon.ico');
  const png = path.join(__dirname, 'icon.png');
  if (fs.existsSync(ico)) {
    fs.copyFileSync(ico, path.join(distDir, 'icon.ico'));
  }
  if (fs.existsSync(png)) {
    fs.copyFileSync(png, path.join(distDir, 'icon.png'));
  }

  // Copy mini-player.html to dist
  const miniHtml = path.join(__dirname, 'src/mini-player.html');
  if (fs.existsSync(miniHtml)) {
    fs.copyFileSync(miniHtml, path.join(distDir, 'mini-player.html'));
  }

  // Copy thumbar icons to dist
  for (const name of ['thumbar-prev.png', 'thumbar-play.png', 'thumbar-pause.png', 'thumbar-next.png']) {
    const iconSrc = path.join(__dirname, 'src', name);
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.join(distDir, name));
    }
  }

  console.log('Mellow Desktop build finished successfully.');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
