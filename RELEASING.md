# Releases maken: hoe en waarom

Deze gids legt niet alleen uit *wat* je moet doen om een nieuwe versie van PC Checker uit te brengen, maar ook *waarom* elke stap bestaat. Lees hem één keer helemaal; daarna is het [stappenoverzicht](#kort-stappenoverzicht) onderaan genoeg.

---

## 1. Het grote plaatje

Een **release** is een vaste, genummerde versie van de app die je aan anderen geeft (bijv. `v0.2.0`), meestal als installer (`.exe`, `.msi`, `.deb` …).

Het verschil met "gewoon `npm run tauri build` op je eigen pc draaien":

| Zelf bouwen op je pc | Release via GitHub Actions |
|---|---|
| Alleen een Windows-installer (je bouwt op Windows) | Windows **én** Linux tegelijk, elk op een eigen schone machine |
| Afhankelijk van wat er toevallig op jouw pc staat | Altijd dezelfde, schone omgeving: reproduceerbaar |
| Je moet het bestand zelf ergens uploaden | Komt automatisch op de GitHub Releases-pagina |
| Signing-certificaat moet op jouw pc staan | Certificaat staat versleuteld in GitHub Secrets |

De hele keten ziet er zo uit:

```
code aanpassen → versie verhogen → commit → tag "v0.2.0" pushen
      → GitHub Actions start release.yml
      → bouwt op Windows- en Linux-machines (optioneel: tekent de Windows-installer)
      → maakt een CONCEPT-release met de installers als bijlage
      → jij controleert en klikt op "Publish"
```

---

## 2. Stap voor stap, met uitleg

### Stap 1: Verhoog het versienummer (op drie plekken)

Pas de versie aan in:

- `package.json` (`"version"`)
- `src-tauri/Cargo.toml` (`version = …`)
- `src-tauri/tauri.conf.json` (`"version"`)

**Waarom?** Een Tauri-app bestaat uit twee projecten die elk hun eigen "boekhouding" hebben: het frontend-project (Node/npm, `package.json`) en het Rust-project (Cargo, `Cargo.toml`). `tauri.conf.json` is de versie die Tauri echt gebruikt: die komt in de installer, in de bestandseigenschappen van de `.exe` en in Windows *Apps & onderdelen*. Houd ze gelijk, anders weet je later niet welke code bij welke installer hoort.

**Welk nummer kies je?** Het project gebruikt [Semantic Versioning](https://semver.org/lang/nl/): `MAJOR.MINOR.PATCH`.

| Wijziging | Voorbeeld | Wanneer |
|---|---|---|
| PATCH | `0.2.0 → 0.2.1` | Alleen bugfixes |
| MINOR | `0.2.1 → 0.3.0` | Nieuwe functies, niets kapot |
| MAJOR | `0.3.0 → 1.0.0` | Grote/brekende wijzigingen, of "nu is het stabiel" |

Zolang de eerste cijfer `0` is, geef je aan dat de app nog in ontwikkeling is.

> 💡 Windows-installers (MSI) accepteren alleen numerieke versies. Gebruik dus `0.3.0`, niet `0.3.0-beta`.

### Stap 2: Commit en maak een tag

```bash
git commit -am "chore: release v0.3.0"
```
```bash
git tag v0.3.0
```
```bash
git push origin master
```
```bash
git push origin v0.3.0
```

**Wat is een tag?** Een commit heeft een onleesbare naam zoals `35f4ebd`. Een *tag* is een vast, leesbaar etiket ("v0.3.0") dat je op één specifieke commit plakt. In tegenstelling tot een branch schuift een tag nooit mee: over twee jaar wijst `v0.3.0` nog steeds naar precies dezelfde code. Zo kun je altijd terugvinden waar een installer van gemaakt is.

**Waarom start de tag de build?** In `.github/workflows/release.yml` staat:

```yaml
on:
  push:
    tags: ["v*"]
```

"Draai deze workflow zodra iemand een tag pusht die met `v` begint." Je kunt hem ook handmatig starten via *Actions → Release → Run workflow* (`workflow_dispatch`).

**Waarom niet bij elke push bouwen?** Een release bouwen kost 10 tot 20 minuten en levert bestanden op die mensen gaan installeren. Dat wil je alleen als je bewust zegt "dit is een versie". Voor elke gewone push draait wel `ci.yml`: die test alles, maar maakt geen release.

### Stap 3: Wat GitHub Actions doet

Bekijk de voortgang onder het tabblad **Actions** op GitHub. Per platform gebeurt dit:

1. **Een schone virtuele machine starten** (`windows-latest`, `ubuntu-22.04`). Je kunt geen Linux-installer bouwen op Windows of andersom, daarom een "matrix" met twee machines die tegelijk draaien.
2. **Node en Rust installeren**, plus voor Linux de systeembibliotheken (WebKitGTK) die Tauri daar nodig heeft om een venster te tonen.
3. **Cache herstellen** (`rust-cache`): Rust-dependencies compileren duurt lang; de cache bewaart ze tussen runs.
4. **Optioneel: het signing-certificaat importeren** (zie hoofdstuk 3).
5. **`tauri-action` draaien**: bouwt de frontend, compileert Rust in release-modus, maakt de installers en uploadt ze naar een GitHub Release.

**Waarom een *concept*-release (`releaseDraft: true`)?** Een gepubliceerde release is meteen zichtbaar voor iedereen. Als concept kun je eerst controleren: zijn alle bestanden er, start de installer, klopt de tekst? Pas als je op **Publish release** klikt, wordt hij openbaar. Dat voorkomt dat een kapotte build per ongeluk uitgedeeld wordt.

### Stap 4: Controleren en publiceren

Op de *Releases*-pagina van de repository:

1. Download de Windows-installer en installeer hem op een pc (bij voorkeur niet je ontwikkel-pc, die heeft alles al geïnstalleerd).
2. Schrijf in de beschrijving wat er veranderd is (de *release notes*). Gebruikers lezen dit; jij later ook.
3. Klik op **Publish release**.

---

## 3. Windows code signing

### Het probleem

Zonder handtekening ziet een gebruiker die jouw installer start dit:

> **Windows heeft uw pc beveiligd** — Microsoft Defender SmartScreen heeft voorkomen dat een niet-herkende app werd gestart.

De gebruiker moet dan op *Meer info → Toch uitvoeren* klikken. Veel mensen doen dat (terecht) niet. Voor een diagnosetool die je aan anderen wilt geven, is dat een groot probleem.

### Wat een handtekening eigenlijk doet

Een digitale handtekening beantwoordt twee vragen:

1. **Wie heeft dit gemaakt?** De handtekening bevat een certificaat waarop staat "uitgegeven aan: <jouw naam/bedrijf>", bevestigd door een **certificaatautoriteit (CA)** zoals DigiCert of Sectigo. De CA heeft vooraf gecontroleerd dat jij echt bent wie je zegt.
2. **Is het bestand onderweg veranderd?** Bij het tekenen wordt een vingerafdruk (hash) van het hele bestand berekend en met jouw **privésleutel** versleuteld. Windows rekent de hash opnieuw uit en controleert hem met de **publieke sleutel** in het certificaat. Is er ook maar één byte aangepast (bijv. door malware), dan klopt de handtekening niet meer.

Dit heet *asymmetrische cryptografie*: wat met de privésleutel is ondertekend, kan iedereen controleren met de publieke sleutel, maar alleen de eigenaar van de privésleutel kan tekenen. Daarom moet die privésleutel geheim blijven.

### Welk certificaat?

| Type | Wat de CA controleert | SmartScreen | Prijs (indicatie) |
|---|---|---|---|
| **OV** (Organization Validation) | Dat je bedrijf/persoon bestaat | Waarschuwing verdwijnt pas na verloop van tijd, als genoeg mensen je app zonder problemen hebben gedownload ("reputatie") | ca. €200–€400/jaar |
| **EV** (Extended Validation) | Uitgebreidere identiteitscontrole | Historisch direct vertrouwd; tegenwoordig bouwt ook EV reputatie op | ca. €300–€600/jaar |
| **Azure Trusted Signing** | Identiteitscontrole door Microsoft | Gedraagt zich als een goed certificaat | ca. $10/maand, beschikbaar voor bedrijven en (in sommige landen) individuen |

Sinds 2023 moeten de privésleutels van nieuwe OV/EV-certificaten op beveiligde hardware staan (USB-token of cloud-HSM). Dan krijg je dus géén `.pfx`-bestand meer. Zie [Als je geen .pfx-bestand hebt](#als-je-geen-pfx-bestand-hebt).

### Instellen met een `.pfx`-bestand

Een `.pfx` is een versleuteld bestand met je certificaat **én** je privésleutel, beveiligd met een wachtwoord.

**1. Zet het bestand om naar base64** (in PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
```

*Waarom base64?* GitHub Secrets kunnen alleen tekst bevatten, en een `.pfx` is binair (willekeurige bytes). Base64 zet bytes om in gewone letters en cijfers. In de workflow zetten we het weer terug (`FromBase64String`).

**2. Maak twee repository-secrets aan** via *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Inhoud |
|---|---|
| `WINDOWS_CERTIFICATE` | De base64-tekst uit stap 1 |
| `WINDOWS_CERTIFICATE_PASSWORD` | Het wachtwoord van het `.pfx`-bestand |

*Waarom secrets en niet gewoon een bestand in de repository?* Iedereen die de code kan zien, zou dan in jouw naam software kunnen tekenen, en malware met jouw handtekening is precies wat je niet wilt. Secrets zijn versleuteld opgeslagen, verschijnen nooit in logs (GitHub vervangt ze door `***`) en zijn niet beschikbaar voor pull requests van forks.

**3. Klaar.** Bij de volgende release doet de workflow automatisch:

1. Het `.pfx` terugzetten en importeren in de Windows-certificaatopslag van de build-machine (en het bestand meteen weer verwijderen).
2. De **thumbprint** opvragen: een unieke ID van het certificaat, zodat Tauri weet welk certificaat in de opslag het moet gebruiken.
3. Tauri laten tekenen met SHA-256 en een **tijdstempel**.

*Waarom die tijdstempel (`timestampUrl`)?* Certificaten verlopen (meestal na 1 tot 3 jaar). Zonder tijdstempel wordt je handtekening ongeldig zodra het certificaat verloopt, ook voor installers die je jaren geleden hebt uitgebracht. Een tijdstempelserver (hier DigiCert) bevestigt onafhankelijk: "deze handtekening bestond al op 5 november 2026, toen het certificaat nog geldig was". Dan blijft hij voor altijd geldig.

Zonder deze secrets slaat de workflow het tekenen over en bouwt hij gewoon een ongetekende installer. Dat is handig om te testen.

### Als je geen .pfx-bestand hebt

Staat je sleutel op een USB-token of in de cloud (Azure Trusted Signing, DigiCert KeyLocker, …), dan kan de build-machine niet bij een bestand. Tauri ondersteunt daarvoor `bundle.windows.signCommand`: een eigen commando dat Tauri per bestand aanroept om te tekenen. Zie de [Tauri-documentatie over Windows-signing](https://v2.tauri.app/distribute/sign/windows/). Voor een hobby- of klein project is Azure Trusted Signing meestal de goedkoopste route.

### En Linux?

Op Linux bestaat geen SmartScreen; `.deb`/`.AppImage`-bestanden worden doorgaans niet getekend zoals op Windows. Wie het zeker wil weten, vergelijkt de SHA-256-checksum die GitHub naast elk bestand toont.

---

## 4. Automatische updates

### Wat het doet

Met de Tauri-updater controleert de app bij het opstarten: "Is er een nieuwere versie?" Zo ja, dan downloadt en installeert hij die. Gebruikers hoeven dan niet zelf naar GitHub.

### Hoe het werkt

1. Bij elke release maakt de build naast de installer ook een `latest.json` aan: "nieuwste versie is 0.3.0, de download staat daar, en dit is de handtekening".
2. De app downloadt `latest.json` van een vaste URL (de *endpoint*).
3. Is de versie nieuwer, dan downloadt de app de update en **controleert de handtekening** met de publieke sleutel die in de app zelf is ingebouwd.
4. Klopt de handtekening, dan wordt de update geïnstalleerd. Klopt hij niet, dan wordt hij geweigerd.

### Waarom een tweede sleutelpaar, naast het code-signing-certificaat?

Het zijn twee verschillende sloten op twee verschillende deuren:

| | Code-signing-certificaat | Updater-sleutel |
|---|---|---|
| Wie controleert? | **Windows** (SmartScreen, bestandseigenschappen) | **Je eigen app** |
| Wat bewijst het? | "Dit bestand komt van <bedrijfsnaam>, bevestigd door een CA" | "Deze update komt van dezelfde maker als de app die al geïnstalleerd is" |
| Kosten | Betaald, bij een CA | Gratis, maak je zelf |

Zonder de updater-handtekening zou iedereen die jouw GitHub-account of de download-URL weet te kapen, kwaadaardige "updates" kunnen uitdelen die automatisch op alle pc's worden geïnstalleerd. De handtekening voorkomt dat: alleen wie de privésleutel heeft, kan een update maken die de app accepteert.

### Hoe het in dit project is ingesteld

Dit staat aan. Zo hangt het in elkaar:

**1. Sleutelpaar (eenmalig, al gedaan).** Gemaakt met:

```powershell
npm run tauri signer generate -- -w "$HOME\.tauri\pc-checker.key"
```

Gebruik op Windows `$HOME` en niet `~`. PowerShell geeft `~` letterlijk door aan npm; dan komt de sleutel in een map die echt `~` heet, **in de repo**. Daarom staan `/~/` en `*.key` in `.gitignore`.

- `pc-checker.key`: de **privésleutel**. Geheim, nooit committen, maak een back-up (bijv. in een wachtwoordmanager).
- `pc-checker.key.pub`: de **publieke sleutel**. Die mag iedereen zien; hij staat in `tauri.conf.json`.

> ⚠️ **Raak je de privésleutel kwijt, dan kun je bestaande installaties nooit meer bijwerken.** Ze accepteren alleen updates die met die ene sleutel zijn getekend. Gebruikers moeten dan handmatig opnieuw installeren. Bewaar hem dus goed.

**2. Secrets in GitHub** (*Settings → Secrets and variables → Actions*): `TAURI_SIGNING_PRIVATE_KEY` (de inhoud van `pc-checker.key`) en `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. In `release.yml` worden ze als `env` aan de `tauri-action`-stap meegegeven:

```yaml
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

*Waarom zo?* Een workflowstap ziet secrets niet vanzelf; je geeft ze per stap door. `${{ secrets.X }}` wordt tijdens het draaien vervangen door de waarde, en in de log toont GitHub `***`. De Tauri-build zoekt precies deze twee namen en tekent daarmee de updatebestanden.

> Ontbreekt de sleutel terwijl `createUpdaterArtifacts` aan staat, dan **faalt de release-build**. Dat is bewust: liever geen release dan een update die niemand kan installeren.

**3. De plugins in de app:**
- Rust: `tauri-plugin-updater` en `tauri-plugin-process` in `Cargo.toml`, geregistreerd in `lib.rs`. De process-plugin is nodig om de app na de update te herstarten.
- Frontend: `src/components/UpdateNotice.tsx` roept bij het opstarten `check()` aan. Is er een nieuwere versie, dan verschijnt een balk met *Installeren en herstarten* (met voortgang) en een kruisje voor *Later*. Later onthoudt die versie; bij de volgende versie verschijnt de balk weer. Tijdens `tauri dev` en in de browser wordt niet gecontroleerd. Mislukt de check (geen internet, nog geen release met `latest.json`), dan gebeurt er niets.

**4. `tauri.conf.json`:**
- `"createUpdaterArtifacts": true` onder `bundle`: de build maakt dan `latest.json` en de `.sig`-handtekeningbestanden, en `tauri-action` zet ze bij de release.
- Onder `plugins.updater`: de `pubkey` en als endpoint
  `https://github.com/lucius02/pc-checker/releases/latest/download/latest.json`.
  Die URL wijst altijd naar de nieuwste **gepubliceerde** release. Concepten tellen niet mee; nog een reden om eerst te controleren en dan pas te publiceren.
- `"windows": { "installMode": "passive" }`: Windows toont alleen een voortgangsbalk, zonder vragen.

**5. Toestemming:** `updater:default` en `process:allow-restart` in `src-tauri/capabilities/default.json`.

**Goed om te weten:**
- De eerste release met de updater kan zichzelf nog niet bijwerken: die heeft de updater pas *na* installatie. Vanaf de daaropvolgende release werkt het automatisch.
- Op Linux werkt de updater alleen met de **AppImage**. Wie de `.deb` installeerde, update via een nieuwe `.deb`.

*Waarom die laatste stap?* Tauri v2 werkt met **capabilities**: de webpagina in de app mag standaard niets met het systeem, tenzij je het per functie expliciet toestaat. Mocht er ooit kwaadaardige code in de frontend terechtkomen, dan kan die alleen de functies gebruiken die jij hebt vrijgegeven. Daarom staan in `default.json` alleen `dialog:allow-save` en `fs:allow-write-text-file` (nodig voor het exporteren van rapporten), de twee updater-rechten hierboven, en verder niets.

---

## 5. Begrippenlijst

| Begrip | Betekenis |
|---|---|
| **CI** (Continuous Integration) | Bij elke push automatisch bouwen en testen (`ci.yml`). |
| **CD** (Continuous Delivery) | Automatisch een uitbrengbare versie maken (`release.yml`). |
| **Workflow** | Een YAML-bestand in `.github/workflows/` met stappen die GitHub Actions uitvoert. |
| **Runner** | De (virtuele) machine waarop een workflow draait. |
| **Matrix** | Dezelfde job tegelijk op meerdere machines/varianten draaien. |
| **Tag** | Vast label op één commit, bijv. `v0.3.0`. |
| **Artefact** | Een bestand dat een build oplevert (installer, `latest.json`). |
| **Secret** | Versleuteld opgeslagen waarde in GitHub (wachtwoord, sleutel). |
| **CA** | Certificaatautoriteit: bedrijf dat je identiteit controleert en certificaten uitgeeft. |
| **Privé-/publieke sleutel** | Sleutelpaar: met de privésleutel teken je, met de publieke sleutel controleert iedereen. |
| **Hash** | Korte, unieke vingerafdruk van een bestand; verandert bij elke wijziging. |
| **Thumbprint** | Hash van een certificaat, gebruikt als ID. |
| **Tijdstempel** | Bewijs van een externe server dat een handtekening op een bepaald moment bestond. |
| **SmartScreen** | Windows-beveiliging die onbekende/ongetekende programma's tegenhoudt. |
| **NSIS / MSI** | Twee soorten Windows-installers (`.exe`-setup en Windows Installer-pakket). |

---

## Kort stappenoverzicht

1. Versie verhogen in `package.json`, `src-tauri/Cargo.toml` en `src-tauri/tauri.conf.json`.
2. Commit, `git tag vX.Y.Z`, push de branch en de tag.
3. Wacht tot de *Release*-workflow onder **Actions** groen is.
4. Concept-release controleren: installer testen, release notes schrijven.
5. **Publish release**.

Eenmalig, optioneel: code-signing-secrets toevoegen (hoofdstuk 3). De updater staat al aan (hoofdstuk 4).
