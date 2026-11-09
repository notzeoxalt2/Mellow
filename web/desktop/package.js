import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const desktopDir = __dirname;
const appDistDir = path.join(rootDir, 'app/dist');
const releaseDir = process.env.MELLOW_PACKAGE_OUTPUT
  ? path.resolve(process.env.MELLOW_PACKAGE_OUTPUT)
  : path.join(rootDir, 'release/Mellow-win32-x64');
const electronDistDir = path.resolve(
  rootDir,
  'node_modules/.pnpm/electron@44.7.0_supports-color@7.2.0/node_modules/electron/dist'
);

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function packageApp() {
  console.log('Packaging Mellow Desktop Application...');
  
  if (!fs.existsSync(electronDistDir)) {
    throw new Error(`Electron dist not found at ${electronDistDir}`);
  }

  // 1. Prepare release dir
  if (fs.existsSync(releaseDir)) {
    try {
      fs.rmSync(releaseDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not clean release dir (process may be open):', e.message);
    }
  }
  fs.mkdirSync(releaseDir, { recursive: true });

  // 2. Copy Electron distribution
  console.log('Copying Electron runtime binaries...');
  copyDirSync(electronDistDir, releaseDir);

  // 3. Rename electron.exe to Mellow.exe
  const oldExe = path.join(releaseDir, 'electron.exe');
  const newExe = path.join(releaseDir, 'Mellow.exe');
  if (fs.existsSync(oldExe)) {
    fs.renameSync(oldExe, newExe);
  }

  // 4. Create resources/app
  const appTargetDir = path.join(releaseDir, 'resources/app');
  fs.mkdirSync(appTargetDir, { recursive: true });

  // 5. Copy the desktop process bundle (main, preload, Spotify)
  console.log('Copying desktop process bundle...');
  copyDirSync(path.join(desktopDir, 'dist'), path.join(appTargetDir, 'dist'));

  // 6. Copy web app dist
  console.log('Copying web frontend bundle...');
  copyDirSync(appDistDir, path.join(appTargetDir, 'app/dist'));

  // 7. Write packaged app package.json
  const appPackageJson = {
    name: "mellow-desktop",
    version: "1.0.0",
    main: "dist/main.js",
    type: "module",
    description: "Mellow Music Player"
  };
  fs.writeFileSync(
    path.join(appTargetDir, 'package.json'),
    JSON.stringify(appPackageJson, null, 2),
    'utf8'
  );

  // 8. Copy icons
  const icoSrc = path.join(desktopDir, 'icon.ico');
  const pngSrc = path.join(desktopDir, 'icon.png');
  const logoSrc = path.resolve(rootDir, '../Logo.png');

  if (fs.existsSync(icoSrc)) {
    fs.copyFileSync(icoSrc, path.join(releaseDir, 'icon.ico'));
    fs.copyFileSync(icoSrc, path.join(appTargetDir, 'dist/icon.ico'));
  }
  if (fs.existsSync(pngSrc)) {
    fs.copyFileSync(pngSrc, path.join(releaseDir, 'icon.png'));
    fs.copyFileSync(pngSrc, path.join(appTargetDir, 'dist/icon.png'));
  }
  if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, path.join(releaseDir, 'Mellow.png'));
  }

  // 10. Ship the browser bridge beside the app. YouTube Music and Spotify
  // account features require the unpacked extension to be loaded in Chrome;
  // keeping it beside Mellow makes that dependency visible and installable.
  const extensionSrc = path.join(rootDir, 'extension/.output/chrome-mv3');
  const extensionTarget = path.join(releaseDir, 'Mellow Chrome Extension');
  if (fs.existsSync(path.join(extensionSrc, 'manifest.json'))) {
    copyDirSync(extensionSrc, extensionTarget);
    fs.writeFileSync(
      path.join(releaseDir, 'README.txt'),
      [
        'Mellow for Windows',
        '',
        'Run Mellow.exe to open the desktop player.',
        '',
        'For signed-in YouTube Music and Spotify features, load the included browser bridge:',
        '1. Open chrome://extensions in Chrome.',
        '2. Turn on Developer mode.',
        '3. Choose Load unpacked and select the “Mellow Chrome Extension” folder beside Mellow.exe.',
        '4. Open Mellow and connect each service from Settings.',
        '',
        'The extension reads service sessions locally in Chrome to support Mellow. Do not share your browser profile.',
        '',
      ].join('\r\n'),
      'utf8',
    );
    console.log('Bundled Mellow Chrome Extension and setup guide.');
  } else {
    console.warn('Chrome extension build not found; package omits the browser bridge. Build @bitchord/extension first.');
  }

  // 9. Patch Mellow.exe PE resources with official icon using resedit
  console.log('Embedding official Mellow icon into executable...');
  try {
    const reseditPath = path.resolve(
      rootDir,
      'node_modules/.pnpm/resedit@1.7.2/node_modules/resedit'
    );
    const resedit = require(reseditPath);
    const exe = resedit.NtExecutable.from(fs.readFileSync(newExe));
    const res = resedit.NtExecutableResource.from(exe);
    const iconFile = resedit.Data.IconFile.from(fs.readFileSync(icoSrc));

    resedit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,
      1033,
      iconFile.icons.map((item) => item.data)
    );

    // Also patch VersionInfo so Windows displays "Mellow" in Taskbar, Volume Mixer, and Notifications
    const viList = resedit.Resource.VersionInfo.fromEntries(res.entries);
    let vi = viList[0];
    if (!vi) {
      vi = resedit.Resource.VersionInfo.createEmpty();
      vi.lang = 1033;
    }
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        FileDescription: 'Mellow',
        ProductName: 'Mellow',
        CompanyName: 'Mellow',
        LegalCopyright: 'Mellow Music',
        OriginalFilename: 'Mellow.exe',
        InternalName: 'Mellow'
      }
    );
    vi.outputToResourceEntries(res.entries);

    res.outputResource(exe);
    fs.writeFileSync(newExe, Buffer.from(exe.generate()));
    console.log('Official icon successfully embedded in Mellow.exe!');
  } catch (err) {
    console.warn('Could not patch exe resource with resedit:', err.message);
  }

  console.log(`\n========================================`);
  console.log(`SUCCESS! Mellow Desktop is fully packaged:`);
  console.log(`Executable: ${newExe}`);
  console.log(`App Icon: ${icoSrc}`);
  console.log(`========================================\n`);
}

packageApp().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
