#!/usr/bin/env node
/**
 * Merges all platform entries from a GitHub release's assets into a single latest.json
 * and uploads it. Fixes the case where parallel matrix jobs overwrite latest.json with
 * only one platform (so e.g. macOS update check fails when Windows job wrote last).
 *
 * Usage: node merge-updater-latest.js <repo-owner> <repo-name> <tag-name> <github-token>
 */

const https = require('https');

const [owner, repo, tagName, token] = process.argv.slice(2);
if (!owner || !repo || !tagName || !token) {
  console.error('Usage: merge-updater-latest.js <owner> <repo> <tag> <token>');
  process.exit(1);
}

const VERSION = tagName.replace(/^Builder-v/, '') || '0.0.0';
const BASE = `https://api.github.com/repos/${owner}/${repo}`;
const UPLOAD_BASE = `https://uploads.github.com/repos/${owner}/${repo}`;
const defaultHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: opts.method || 'GET',
        headers: { ...defaultHeaders, ...opts.headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          if (res.statusCode >= 400) reject(new Error(`${url} ${res.statusCode} ${body}`));
          else resolve({ status: res.statusCode, body, json: () => JSON.parse(body) });
        });
      }
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function downloadAsset(assetId) {
  const url = `${BASE}/releases/assets/${assetId}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: { ...defaultHeaders, Accept: 'application/octet-stream' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`${url} ${res.statusCode}`));
          else resolve(Buffer.concat(chunks).toString());
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const releaseRes = await request(`${BASE}/releases/tags/${tagName}`);
  const release = releaseRes.json();
  const releaseId = release.id;
  const assets = release.assets || [];

  const platforms = {};
  const urlAssets = assets.filter((a) => !a.name.endsWith('.sig') && a.name !== 'latest.json');
  const sigAssets = assets.filter((a) => a.name.endsWith('.sig'));

  for (const a of urlAssets) {
    let platform = null;
    if (/Builder\.app\.tar\.gz$/i.test(a.name)) platform = 'darwin-aarch64';
    else if (/\.(msi|exe)$/i.test(a.name) || /\.nsis\.zip$/i.test(a.name)) platform = 'windows-x86_64';
    if (!platform) continue;
    const sigAsset = sigAssets.find((s) => s.name === a.name + '.sig');
    if (!sigAsset) continue;
    const sigContent = (await downloadAsset(sigAsset.id)).trim();
    platforms[platform] = { url: a.browser_download_url, signature: sigContent };
  }

  if (Object.keys(platforms).length === 0) {
    console.error('No platform assets found. Asset names:', assets.map((a) => a.name).join(', '));
    process.exit(1);
  }

  const latest = {
    version: VERSION,
    notes: release.body || `Builder ${VERSION}`,
    pub_date: release.published_at || new Date().toISOString(),
    platforms,
  };

  const existingLatest = assets.find((a) => a.name === 'latest.json');
  if (existingLatest) {
    await request(`${BASE}/releases/assets/${existingLatest.id}`, { method: 'DELETE' });
  }

  const body = JSON.stringify(latest);
  const uploadUrl = `${UPLOAD_BASE}/releases/${releaseId}/assets?name=latest.json`;
  await request(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    body,
  });

  console.log('Merged latest.json with platforms:', Object.keys(platforms).join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
