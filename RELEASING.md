# Releases maken

## Automatisch via GitHub Actions

1. Verhoog de versie in `package.json`, `src-tauri/Cargo.toml` en `src-tauri/tauri.conf.json`.
2. Commit, tag en push:
   ```bash
   git tag v0.2.0
   ```
   ```bash
   git push origin v0.2.0
   ```
3. `.github/workflows/release.yml` bouwt de Windows-installers (NSIS `.exe` + `.msi`) en Linux-pakketten (`.deb`, `.AppImage`, `.rpm`) en maakt een **concept**-release aan. Controleer die en publiceer hem handmatig.

## Windows code signing (aanbevolen)

Zonder handtekening toont Windows SmartScreen een waarschuwing bij het installeren. Je hebt daarvoor een code-signing-certificaat nodig (OV of EV) van een certificaatautoriteit; dat kan dit project niet voor je regelen.

Zet daarna twee repository-secrets (*Settings → Secrets and variables → Actions*):

| Secret | Inhoud |
|---|---|
| `WINDOWS_CERTIFICATE` | Het `.pfx`-bestand als base64 (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`) |
| `WINDOWS_CERTIFICATE_PASSWORD` | Het wachtwoord van het `.pfx`-bestand |

De release-workflow importeert het certificaat dan automatisch en laat Tauri de installers tekenen met een SHA-256-tijdstempel. Zonder deze secrets wordt er gewoon ongetekend gebouwd.

> EV-certificaten op een hardware-token of in een cloud-HSM (bijv. Azure Trusted Signing) werken niet met een `.pfx`. Gebruik dan `bundle.windows.signCommand` in `tauri.conf.json`, zie de [Tauri-documentatie over Windows-signing](https://v2.tauri.app/distribute/sign/windows/).

## Automatische updates (nog niet ingeschakeld)

De auto-updater is bewust nog niet geactiveerd: hij heeft een eigen sleutelpaar nodig, en zonder geldige publieke sleutel start de plugin niet. Inschakelen:

1. Genereer een sleutelpaar en bewaar de privésleutel veilig:
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/pc-checker.key
   ```
2. Voeg secrets `TAURI_SIGNING_PRIVATE_KEY` (inhoud van het `.key`-bestand) en `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` toe en geef ze als `env` mee aan de `tauri-action`-stap.
3. Voeg `tauri-plugin-updater` toe (Rust + `@tauri-apps/plugin-updater`), zet `"createUpdaterArtifacts": true` onder `bundle`, en configureer onder `plugins.updater` de `pubkey` en als endpoint
   `https://github.com/lucius02/pc-checker/releases/latest/download/latest.json`.
4. Voeg `updater:default` toe aan `src-tauri/capabilities/default.json`.
