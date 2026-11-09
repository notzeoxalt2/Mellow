import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const OWNER = 'notzeoxalt2';
const REPO = 'Mellow';
const TAG = 'v1.0.0';
const RELEASE_NAME = 'Mellow v1.0.0';
const RELEASE_NOTES = `## Mellow v1.0.0 — Official Windows Release

### Features & Highlights
- **Unified Music Player**: Stream seamlessly from YouTube Music and Spotify.
- **Dynamic Ambient Theme**: Real-time background tinting from artwork colors, matching active playlists.
- **Rich Desktop Controls**: Custom frameless window, Taskbar thumbar controls, Mini Player picture-in-picture mode, Windows accent sync.
- **Built-in Auto-Updater**: Automatic silent background checks with one-click update and restart directly in Settings.

### Downloads
- **Windows Installer**: \`Mellow-Setup-1.0.0.exe\` (Recommended)
- **Portable Zip**: \`Mellow-win32-x64-v1.0.0.zip\`
`;

const token = process.env.GITHUB_TOKEN || process.argv[2];

if (!token) {
  console.error('\n[Error] No GitHub token provided.');
  console.log('Usage: node web/scripts/publish-release.mjs <GITHUB_PAT>');
  console.log('Or set the GITHUB_TOKEN environment variable.\n');
  process.exit(1);
}

const installerDir = path.resolve('web/release/installer');
const filesToUpload = [
  path.join(installerDir, 'Mellow-Setup-1.0.0.exe'),
  path.join(installerDir, 'Mellow-win32-x64-v1.0.0.zip'),
];

async function apiRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`);
    const req = https.request(
      url,
      {
        method,
        headers: {
          'User-Agent': 'Mellow-Release-Script',
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          ...(data ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body ? JSON.parse(body) : null);
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function uploadAsset(uploadUrlTemplate, filePath) {
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);
  const uploadUrl = uploadUrlTemplate.replace(/\{.*?\}$/, `?name=${encodeURIComponent(fileName)}`);
  const url = new URL(uploadUrl);

  console.log(`Uploading ${fileName} (${(stats.size / (1024 * 1024)).toFixed(1)} MB)...`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Mellow-Release-Script',
          Authorization: `token ${token}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': stats.size,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 201) {
            console.log(`✓ Uploaded ${fileName}`);
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Asset upload error ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}

async function main() {
  console.log(`Publishing release for ${OWNER}/${REPO} (${TAG})...`);

  // 1. Check or create release
  let release;
  try {
    release = await apiRequest(`/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
    console.log(`Existing release found: ${release.html_url}`);
  } catch {
    console.log(`Creating new release ${TAG}...`);
    release = await apiRequest(`/repos/${OWNER}/${REPO}/releases`, 'POST', {
      tag_name: TAG,
      name: RELEASE_NAME,
      body: RELEASE_NOTES,
      draft: false,
      prerelease: false,
    });
    console.log(`Release created: ${release.html_url}`);
  }

  // 2. Upload assets
  for (const file of filesToUpload) {
    if (fs.existsSync(file)) {
      await uploadAsset(release.upload_url, file);
    } else {
      console.warn(`File not found: ${file}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`🎉 RELEASE PUBLISHED SUCCESSFULLY!`);
  console.log(`View it at: ${release.html_url}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error('\n[Error]', err.message);
  process.exit(1);
});
