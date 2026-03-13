# Tauri Auto-Updater – Activation & Release Steps

The app uses the [Tauri Updater plugin](https://v2.tauri.app/plugin/updater/). To **activate** updates and **push** new versions, do the following.

---

## 1. Generate signing keys (one-time)

Updates must be signed. Generate a keypair and store the private key safely:

```bash
npm run tauri signer generate -- -w ~/.tauri/builder.key
```

(The `--` is required so npm passes `-w` to the Tauri CLI instead of treating it as npm’s `--workspace`.)

- This creates **two** files (e.g. in `~/.tauri/`): a **private** key and a **.pub** (public) file.
- **Never** commit or share the private key. If you lose it, you cannot publish new updates for already-installed apps.

---

## 2. Configure public key and endpoints

Edit **`src-tauri/tauri.conf.json`**:

1. **`plugins.updater.pubkey`**  
   Paste the **entire contents** of the `.pub` file (e.g. `builder.key.pub`). It must be the raw key string, not a file path.

2. **`plugins.updater.endpoints`**  
   Set the URL(s) the app will use to check for updates. Examples:

   - **GitHub Releases** (use your actual repo; [tauri-action](https://github.com/tauri-apps/tauri-action) generates `latest.json` automatically):
     ```json
     "endpoints": [
       "https://github.com/YOUR_ORG/YOUR_REPO/releases/latest/download/latest.json"
     ]
     ```
     Replace `YOUR_ORG/YOUR_REPO` with your GitHub org and repo (e.g. `regere/builder`).
   - **Custom server** (you can use `{{target}}`, `{{arch}}`, `{{current_version}}` in the URL):
     ```json
     "endpoints": [
       "https://releases.yourdomain.com/{{target}}/{{arch}}/{{current_version}}"
     ]
     ```

---

## 2b. GitHub Actions (optional)

A workflow at **`.github/workflows/release.yml`** builds the app and publishes a draft GitHub Release with installers and **latest.json** for the updater.

**To use it:**

1. **Set the updater endpoint** in `src-tauri/tauri.conf.json` to your repo’s `latest.json`:
   ```json
   "endpoints": [
     "https://github.com/YOUR_ORG/YOUR_REPO/releases/latest/download/latest.json"
   ]
   ```

2. **Add repository secrets** (Settings → Secrets and variables → Actions):
   - **`TAURI_SIGNING_PRIVATE_KEY`** – Full contents of your private key file (e.g. `cat ~/.tauri/builder.key`).
   - **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`** (optional) – Password for the key if you set one.

3. **Enable write permission for the Actions token**: Settings → Actions → General → Workflow permissions → “Read and write permissions”.

4. **Trigger a release**: Push to the **`release`** branch, or run the “Release” workflow manually from the Actions tab. The workflow creates a **draft** release; publish it from the Releases page when ready.

The workflow builds for macOS (Apple Silicon + Intel), Windows, and Linux (Ubuntu x64). Each run uploads artifacts and updates **latest.json** so the in-app “Check for Updates” works.

---

## 3. Build with the private key (every release)

The private key is **not** read from `.env`; it must be in the **environment** when you run the build.

**macOS / Linux:**

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/builder.key)"
# If the key is password-protected:
# export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"

npm run tauri:build
# Or your platform-specific script, e.g. build:mac
```

**Windows (PowerShell):**

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Path "$env:USERPROFILE\.tauri\builder.key" -Raw
npm run tauri:build
```

After a successful build, Tauri will produce **updater artifacts** next to your installers, for example:

- **macOS:** `src-tauri/target/release/bundle/macos/` → `Builder.app.tar.gz` and `Builder.app.tar.gz.sig`
- **Windows:** `src-tauri/target/release/bundle/nsis/` (or `msi/`) → `.sig` files for the installers
- **Linux:** `src-tauri/target/release/bundle/appimage/` → `Builder.AppImage.sig` (or `.tar.gz.sig` depending on config)

---

## 4. Publish the update (push changes)

1. **Upload** the new installer (e.g. DMG, MSI, NSIS, AppImage) to your release host (e.g. GitHub Releases).
2. **Serve the updater JSON** that points to that installer and its **signature**.

   **Static JSON (e.g. GitHub Releases with `latest.json`):**

   - The JSON must include `version`, `platforms`, and for each platform `url` and `signature`.
   - `signature` must be the **exact contents** of the corresponding `.sig` file (not a path or URL).
   - Example shape:

   ```json
   {
     "version": "1.0.1",
     "notes": "Bug fixes and improvements",
     "pub_date": "2025-03-13T12:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "<contents of Builder.app.tar.gz.sig>",
         "url": "https://github.com/your-org/builder/releases/download/v1.0.1/Builder.app.tar.gz"
       },
       "darwin-x86_64": { ... },
       "windows-x86_64": { ... },
       "linux-x86_64": { ... }
     }
   }
   ```

   If you use **Tauri Action** or **CrabNebula Cloud**, they can generate this JSON and signatures for you.

3. Ensure the **endpoint** in `tauri.conf.json` (e.g. `latest.json` or your dynamic URL) returns this JSON for the new version.

Once the new version is available at the configured endpoint, existing installations will see it when users choose **Help → Check for Updates** (or when you add an automatic check).

---

## 5. User experience

- **Help → Check for Updates** runs the update check, downloads the update if available, installs it, and restarts the app.
- On Windows, the app exits automatically when the installer runs; the user completes the installer and reopens the app.

---

## Summary checklist

| Step | Action |
|------|--------|
| 1 | Run `npm run tauri signer generate -- -w ~/.tauri/builder.key` and back up the private key. |
| 2 | Put the **public** key in `tauri.conf.json` → `plugins.updater.pubkey` and set `plugins.updater.endpoints` (use your GitHub repo URL for `latest.json`). |
| 2b | **(CI)** Add secrets `TAURI_SIGNING_PRIVATE_KEY` and (optional) `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; enable Actions write permission; push to `release` or run the Release workflow. |
| 3 | For each **local** release: set `TAURI_SIGNING_PRIVATE_KEY` (and optional password), then run `npm run tauri:build`. |
| 4 | Upload installers and `.sig` contents to your server; serve the updater JSON at the configured endpoint (or use the draft GitHub Release from the workflow). |

For dynamic update servers and more options, see the [Tauri Updater docs](https://v2.tauri.app/plugin/updater/).
