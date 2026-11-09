#!/usr/bin/env node

/**
 * Read-only Mellow storage inventory.
 *
 *   pnpm storage:audit
 *   pnpm storage:audit -- --json
 *
 * This intentionally never deletes or modifies files. It only totals release
 * payloads and hashes each Mellow.exe to expose duplicate
 * packaged runtimes, then totals the known disposable Electron cache folders.
 * Auth, settings, IndexedDB, and playback data are never traversed.
 */
import { createHash } from 'node:crypto';
import { readdir, lstat, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const releaseRoot = resolve(process.env.MELLOW_RELEASE_DIR || join(repoRoot, 'release'));
const userDataRoot = resolve(process.env.MELLOW_USER_DATA_DIR || join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'mellow-desktop'));
const jsonOutput = process.argv.includes('--json');
const verifyExecutables = process.argv.includes('--verify-executables');
const help = process.argv.includes('--help') || process.argv.includes('-h');
const CACHE_NAMES = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'ShaderCache', 'GrShaderCache']);

if (help) {
  console.log('Read-only Mellow storage audit. Options: --json, --verify-executables, --help.');
  console.log('Override paths with MELLOW_RELEASE_DIR and MELLOW_USER_DATA_DIR.');
  console.log('--verify-executables streams every packaged Mellow.exe to compare SHA-256; this can read many gigabytes.');
  process.exit(0);
}

async function exists(path) {
  try { return await lstat(path); } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function treeBytes(path) {
  const info = await exists(path);
  if (!info) return 0;
  if (info.isFile()) return info.size;
  if (!info.isDirectory()) return 0;
  let bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    // Never follow links outside of the audited directory.
    if (entry.isSymbolicLink()) continue;
    bytes += await treeBytes(join(path, entry.name));
  }
  return bytes;
}

async function sha256(path) {
  const file = await open(path, 'r');
  const hash = createHash('sha256');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest('hex');
  } finally {
    await file.close();
  }
}

async function releaseInventory() {
  const rootInfo = await exists(releaseRoot);
  if (!rootInfo?.isDirectory()) return { path: releaseRoot, count: 0, bytes: 0, duplicateExecutables: [], packages: [] };
  const packages = [];
  for (const entry of await readdir(releaseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('Mellow-win32-x64')) continue;
    const path = join(releaseRoot, entry.name);
    const bytes = await treeBytes(path);
    const exePath = join(path, 'Mellow.exe');
    const exeInfo = await exists(exePath);
    packages.push({
      name: entry.name,
      path,
      bytes,
      executableBytes: exeInfo?.isFile() ? exeInfo.size : null,
      executableSha256: verifyExecutables && exeInfo?.isFile() ? await sha256(exePath) : null,
    });
  }
  const hashes = new Map();
  for (const pkg of packages) {
    if (pkg.executableBytes == null) continue;
    const key = pkg.executableSha256 ?? `size:${pkg.executableBytes}`;
    const matches = hashes.get(key) ?? [];
    matches.push(pkg.name);
    hashes.set(key, matches);
  }
  return {
    path: releaseRoot,
    count: packages.length,
    bytes: packages.reduce((total, pkg) => total + pkg.bytes, 0),
    duplicateExecutables: [...hashes.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([key, names]) => ({
        sha256: key.startsWith('size:') ? null : key,
        executableBytes: Number(key.startsWith('size:') ? key.slice(5) : packages.find((pkg) => pkg.name === names[0])?.executableBytes ?? 0),
        count: names.length,
        packages: names,
      })),
    packages: packages.sort((a, b) => b.bytes - a.bytes),
  };
}

async function cacheInventory() {
  const rootInfo = await exists(userDataRoot);
  if (!rootInfo?.isDirectory()) return { path: userDataRoot, bytes: 0, folders: [] };
  const folders = [];
  for (const entry of await readdir(userDataRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !CACHE_NAMES.has(entry.name)) continue;
    const path = join(userDataRoot, entry.name);
    folders.push({ name: entry.name, bytes: await treeBytes(path) });
  }
  // Chromium's service-worker HTTP cache is disposable, unlike the app's
  // IndexedDB/localStorage where settings and account state live.
  const serviceWorkerCache = join(userDataRoot, 'Service Worker', 'CacheStorage');
  const serviceWorkerBytes = await treeBytes(serviceWorkerCache);
  if (serviceWorkerBytes) folders.push({ name: 'Service Worker/CacheStorage', bytes: serviceWorkerBytes });
  return {
    path: userDataRoot,
    bytes: folders.reduce((total, folder) => total + folder.bytes, 0),
    folders: folders.sort((a, b) => b.bytes - a.bytes),
  };
}

const [releases, caches] = await Promise.all([releaseInventory(), cacheInventory()]);
const report = {
  mode: 'read-only',
  generatedAt: new Date().toISOString(),
  releases,
  disposableCaches: caches,
  protectedData: ['mellow_auth.json', 'settings', 'IndexedDB', 'localStorage', 'playback state'],
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  console.log(`Mellow storage audit (READ ONLY) — ${report.generatedAt}`);
  console.log(`Release folder: ${releases.path}`);
  console.log(`  ${releases.count} Mellow package snapshots · ${mib(releases.bytes)} total`);
  console.log(verifyExecutables
    ? `  ${releases.duplicateExecutables.length} groups share identical Mellow.exe hashes`
    : `  ${releases.duplicateExecutables.length} groups have same-sized Mellow.exe candidates; use --verify-executables for exact SHA-256`);
  for (const group of releases.duplicateExecutables) {
    const identity = group.sha256 ? `${group.sha256.slice(0, 12)}…` : 'size match only';
    console.log(`  ${group.count} ${group.sha256 ? 'identical' : 'same-sized'} executables · ${mib(group.executableBytes)} each · ${identity}`);
  }
  console.log(`App cache folder: ${caches.path}`);
  console.log(`  ${mib(caches.bytes)} in named disposable cache folders`);
  for (const folder of caches.folders) console.log(`  ${mib(folder.bytes)} · ${folder.name}`);
  console.log('No files were changed. Auth, preferences, IndexedDB, and playback data were not read or included.');
}

