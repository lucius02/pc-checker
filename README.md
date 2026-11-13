# 💻 PC Checker - Cross-Platform Hardware Diagnostics & Health Suite

Een professionele, lichte en razendsnelle desktop applicatie voor hardware-diagnostiek, systeembewaking, koelingsinspectie en stresstests.

| Platform | Status |
|---|---|
| **Windows 10/11** | Volledig: alle modules (WMI, Event Log, powercfg, Storage Reliability Counters, DPC-tellers). |
| **Linux** | Gedeeltelijk: systeemoverzicht (sysfs/DMI, `lspci`), temperaturen en fans (hwmon), stroom & batterij (`/sys/class/power_supply`), freeze-scan via `journalctl -k`, stresstests, live monitor. SMART via `smartctl` (met root-rechten). Geen driver-check of DPC-latency-tellers. |
| **macOS** | Basis: systeemoverzicht, temperaturen (sysinfo), stresstests en live monitor. |

Gebouwd met **Tauri v2**, **Rust** (native hardware-engine), **React 19** en **Tailwind CSS**.

---

## ⚡ Functionaliteiten & Modules

### 1. 🛡️ Freeze Detective & Watchdog *(Systeem Freeze Opsporing)*
* **Achtergrond Watchdog (Live):** Monitort live en continu de thread scheduling in de kernel. Zodra het besturingssysteem langer dan 1.2 seconde bevriest, legt hij het exacte tijdstip en de precieze freeze-duur in milliseconden vast.
* **Windows Systeemlogboek Scanner:** Scant met 1 klik op bekende boosdoeners van desktop freezes:
  * `storahci` Event 129 (*Reset to device was issued*): Dé #1 oorzaak: SATA/SSD slaapstand time-out (ALPM) of slechte datakabel.
  * `disk` Event 153 / 51 (*I/O retry*): Foutieve sectoren of buffer-hangups.
  * `Display` / `nvlddmkm` / `amdkmdag` Event 4101 (*GPU TDR*): Videokaart driver reageerde niet op tijd en is herstart door Windows.
  * `Microsoft-Windows-WHEA-Logger`: Hardware PCIe / CPU bus pariteitsfouten.
* **Directe Oplossingsrichting:** Geeft per incident direct de stappen om het op te lossen (SATA LPM uitschakelen, DDU driver-reinstall, kabels controleren).

### 2. ⚡ Stroomvoorziening & Energiebeheer
* **Automatische herkenning:** Schakelt automatisch om tussen **Laptop** (mobiele voeding) en **Desktop PC** (vaste netstroom).
* **Laptop:** Laadpercentage, AC-adapter verbinding, oplaadstatus en geschatte accuduur.
* **Batterijconditie:** ontwerp- vs. volledige capaciteit en laadcycli uit `powercfg /batteryreport` (Windows) of sysfs (Linux). Ontbreken die gegevens, dan meldt de app "Onbekend" in plaats van verzonnen waarden.
* **Desktop PC:** Directe controle van AC Line status, actief Windows Energieplan (Gebalanceerd, Hoge Prestaties) en waarschuwingen voor te agressieve slaapstanden op schijven.

### 3. 🌀 Koeling, Ventilatoren & Thermische Sensoren
* **Temperatuursensoren:** Real-time uitlezing van CPU-kernen, GPU en opslagstations.
* **Ventilatorsnelheden (RPM):** Detecteert actieve ventilatoren via ACPI/WMI en Embedded Controller (EC) status.
* **Throttling Detectie:** Waarschuwt direct met visuele waarschuwingen zodra sensoren boven de 90°C stijgen.

### 4. 🔥 CPU Multi-Core Stresstest
* Live belasting en kloksnelheid per individuele kern.
* Multithreaded floating-point stresstest via `rayon` met score in **MOps/s** (Million Operations/sec).
* **Rekenverificatie:** elk rekenblok wordt bit-exact vergeleken met een vooraf berekende referentie. Een afwijking betekent dat de CPU onder belasting fout rekent (instabiele overclock/undervolt, oververhitting).

### 5. ⚡ RAM Integriteit & Bit-Flip Verificatie
* 14 patronen per pass: checkerboard (`0xAA`/`0x55`), walking ones, address-in-address (+ inverse), moving inversions (march-test) en seeded random data.
* Instelbaar van 256 MB tot 70% van het vrije geheugen (max. 32 GB); parallel over alle cores.
* Meldt bij fouten het adres, de verwachte en gelezen waarde en de omgevallen bits.

### 6. 💾 Schijf Snelheid & Data-Integriteit
* Automatische herkenning van alle volumes (SSD, HDD, NVMe, USB).
* Sequentiële schrijf- en leessnelheidsmeting (MB/s) met **directe I/O** (Windows `FILE_FLAG_NO_BUFFERING`, Linux `O_DIRECT`, macOS `F_NOCACHE`): je meet de schijf, niet de OS-cache in RAM.
* Elk blok van 1 MB krijgt een uniek, van de blokindex afgeleid patroon, zodat ook verkeerd geplaatste of verouderde blokken worden gevonden.

### 7. 📈 Live Monitor
* Achtergrond-sampler (1x per seconde) die live grafieken voedt voor CPU-belasting, RAM, max. temperatuur, CPU-kloksnelheid, schijf-I/O en netwerkverkeer.
* Ringbuffer van de laatste 5 minuten; onderbrekingen in de lijnen tonen direct waar het systeem bevroor.

### 8. 📋 Procesmonitor
* Top-processen op CPU, RAM of schijfgebruik, elke 2 seconden ververst.
* **Processen vlak vóór een freeze:** koppelt elke door de Watchdog gedetecteerde freeze aan de processen die in de seconden ervoor het drukst waren.

### 9. 🩺 Gezondheidsscore
* Eén score (0-100) en cijfer (A-F) op het overzicht, opgebouwd uit temperatuur, stabiliteit, drivers, DPC latency, opslag, geheugen, processor en batterij.
* Niet-uitgevoerde tests tellen niet mee en worden als "Niet getest" getoond; kritieke bevindingen begrenzen het cijfer.

### 10. 🧩 Driver Check
* Scant alle stuurprogramma's via WMI op probleemapparaten (Apparaatbeheer-foutcodes), verouderde drivers en niet-ondertekende drivers.
* Richt zich op freeze-gevoelige klassen (GPU, opslagcontrollers, netwerk, audio, USB, chipset) met advies per driver.

### 11. ⏱️ DPC Latency
* Meet scheduling-latency met een hoge-prioriteit spin-loop (max / p99 / gemiddeld in µs, histogram) en leest de Windows-tellers `% DPC Time`, `% Interrupt Time` en `DPCs Queued/sec`.
* Noemt waarschijnlijke verdachte drivers op basis van de Driver Check.
* **Per-driver DPC/ISR-meting (ETW, beheerder):** volgt met Event Tracing for Windows elke DPC en interrupt en koppelt die aan de driver die hem uitvoert (zoals LatencyMon). Toont per driver de langste en totale DPC-/ISR-tijd, met een oordeel (DPC < 500 µs en ISR < 100 µs is goed). Gebruikt een eigen *system logger*-sessie, zodat hij niet botst met LatencyMon of Process Explorer.

### 12. ⌨️ Toetsenbord & Ghosting Matrix Test
* **Chassis- & Formaat-detectie:** Schakelt automatisch naar **Laptop 75%** compact bij laptops, en naar **100% Volledig met Numpad** bij desktops. Handmatig omschakelbaar naar TKL 80%.
* **Windows Keyboard Layout Map API:** Herkent live de actieve Windows-toetsenbordindeling (**QWERTY**, **AZERTY**, **QWERTZ**).
* **ANSI vs. ISO Enter Detectie:** Detecteert automatisch of het toetsenbord een ANSI (platte Enter) of ISO indeling (grote L-Enter met `< > |` toets) heeft.
* **N-Key Rollover (NKRO) & Ghosting:** Meet live gelijktijdig ingedrukte toetsen en houdt de maximale rollover-capaciteit bij.
* **Toetsenbord Matrix Verificatie:** Toont geteste toetsen met percentage-voortgang en slaat aanslagen realtime op.

### 13. 🖥️ Beeldscherm & Dode Pixel Detector
* **Volledig Scherm Dode/Vastzittende Pixel Test:** Focust op 8 pure testkleuren (Zwart, Wit, Rood, Groen, Blauw, Geel, Cyaan, Magenta) met toetsenbord- en muisnavigatie.
* **Live Display Telemetrie:** Resolutie, Display Scaling (DPR factor), kleurdiepte (bits) en live gemeten verversingssnelheid (Hz / FPS) via `requestAnimationFrame`.
* **Dynamisch Bereik & Contrast:** 256-staps grijswaarden kleurverloop en een 2%–14% zwartwaardencheck om donkere schaduwdetails te kalibreren.

### 14. 🖱️ Touchpad & 5-Knoppen Muis Diagnostic Suite
* **Hi-DPI Responsive Canvas (1:1 Pixel Mapping):** Geen coördinatenverloop of afkapping; dynamische schaling volgt de cursor haarscherp.
* **Dode Zone Scanner (Vaste Modus) vs. Vloeiend Spoor:** Biedt een permanent tekenvlak om het hele touchpad/muismat in te kleuren met live dekkingsindicator (%), of een vervagend spoor (2s).
* **5-Knoppen Muis Ondersteuning:** Test LMB, MMB (scrollklik), RMB, Zijkant 1 (Vorige / Knop 4) en Zijkant 2 (Volgende / Knop 5) met navigatiebeveiliging.
* **Hardware Dubbelklik-defect (Switch Chatter) Detector:** Waarschuwt direct met visuele waarschuwingen bij klikintervallen onder de 75 ms (slijtage van microswitches).
* **Vastklik- & Sleeptest (Drag & Drop Integriteit):** Toont live of een ingedrukte muisknop contact verliest tijdens het slepen.
* **Scrollwiel & Gesture Telemetrie:** Meet realtime richting (▲, ▼, ◀, ▶) en scrollstappen zonder dat het venster meebeweegt.

### 15. 💽 Schijfgezondheid (SMART)
* Leest per fysieke schijf gezondheidsstatus, slijtage (SSD wear), temperatuur, draaiuren en (niet-)corrigeerbare fouten.
* **Bronnen**, in volgorde van voorkeur:
  * `smartctl` ([smartmontools](https://www.smartmontools.org/)) op Windows, Linux en macOS. Geeft ook omgewisselde en instabiele sectoren, falende SMART-attributen en de NVMe critical warning. Vereist beheerders- of root-rechten.
  * Windows `Get-PhysicalDisk` + `Get-StorageReliabilityCounter`, zonder extra software.
* Het oordeel Goed / Let op / Kritiek telt mee in de gezondheidsscore. Beide bronnen gebruiken dezelfde drempels. Sommige tellers zijn alleen met beheerdersrechten leesbaar; ontbreekt smartctl of de rechten, dan toont de app een tip.

### 16. 🕓 Historie over sessies heen
* Freezes van de Watchdog en gezondheidsscores worden bewaard in `history.json` in de app-datamap.
* Toont freezes per dag (14 dagen), totalen over 7/30 dagen, de langste freeze en het verloop van de score.

### 17. 🎮 GPU Stresstest & 🔥 Burn-in
* **GPU:** WebGL2 fragment-shader op volledige resolutie met instelbare intensiteit; meet FPS (gemiddeld/minimum) en detecteert driver-resets (WebGL context lost, vergelijkbaar met een TDR).
* **Burn-in:** CPU + RAM + GPU tegelijk (5 tot 60 min) met temperatuurlogging en freeze-telling. Vindt instabiele voedingen en overclocks.

### 18. 📄 Rapport exporteren
* **HTML-rapport** (zelfstandig, afdrukbaar, licht/donker) met systeem, gezondheidsscore, alle testresultaten, freeze-oorzaken, SMART en drivers. Via *Afdrukken* ook als PDF op te slaan.
* **JSON** met alle ruwe data.

### 19. 🛡️ Beheerdersmodus
* De header toont of de app verhoogde rechten heeft en kan zichzelf via UAC herstarten als beheerder (Windows). Dat ontgrendelt SMART-temperatuur/slijtage en realtime-prioriteit voor de latency-test.
* Met verhoogde rechten is ook de per-driver DPC/ISR-meting (ETW) in het DPC Latency-tabblad beschikbaar.

### 20. 🌐 Taal
* Volledig Nederlands en Engels: alle tabbladen, het rapport en de teksten die de Rust-backend teruggeeft (samenvattingen, adviezen).
* De taal volgt standaard de systeemtaal en is in de header om te schakelen. Al uitgevoerde tests houden hun taal; nieuwe metingen komen in de gekozen taal.
* Technisch: frontendteksten staan in `src/i18n/` (per tabblad een bestand in `tabs/`), backendteksten via de `tr!`-macro (`src-tauri/src/i18n.rs`). Statuscodes (`Goed`, `Let op`, `Kritiek`, …) blijven bewust Nederlands, omdat de frontend erop vergelijkt; ze worden alleen voor weergave vertaald (`src/i18n/status.ts`).

### 21. ⚡ Prestatie- & Caching Engine (Anti-Lag Architecture)
* **Alle Tauri-commando's zijn `async`:** het werk draait via `spawn_blocking` op worker-threads, zodat stresstests en WMI-queries het venster niet bevriezen (en de eigen freeze/latency-metingen niet verstoren).
* **Native WMI (`wmi`-crate)** voor de vaak gepolde gegevens (GPU, moederbord, thermal zones, fans) in plaats van een PowerShell-proces per poll.
* **Geen knipperende consoles:** alle externe processen gaan via één helper (`shell.rs`) met `CREATE_NO_WINDOW` en een harde time-out.
* **In-Memory Uptime Caching (`SESSION_START_CACHE`):** Vervangt trage 2.2-seconde PowerShell `Get-WinEvent` queries door een in-memory berekening (< 0,001 ms).
* **30-Seconden WMI & Power Plan TTL:** Zware ACPI thermische zones en Windows energieplannen worden slim gecachet; realtime hardwaresensortemperaturen blijven instant (< 1 ms).
* **Frontend In-Flight Request Guards:** Voorkomt opeenhoping van polling-aanroepen en garandeert 60 FPS UI-responsiviteit.
* **Foutmeldingen in beeld:** elk commando geeft `Result<T, String>`; fouten verschijnen als melding rechtsonder in plaats van stil in de console.

---

## 🚀 Aan de slag

### Vereisten
Node.js 22+, Rust (stable) en de [Tauri-vereisten](https://tauri.app/start/prerequisites/) voor je platform.

```bash
npm install
```

### Ontwikkelmodus starten
```bash
npm run tauri dev
```

### Tests en controles
```bash
npm test
```
```bash
npm run lint
```
```bash
npm run typecheck
```
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```
De echte ETW-meting heeft beheerdersrechten nodig en wordt daarom niet standaard getest. Draai hem in een terminal die als administrator is gestart:
```bash
cargo test --manifest-path src-tauri/Cargo.toml live_etw -- --ignored --nocapture
```

### TypeScript-types uit Rust genereren
De types in `src/types/generated/` worden met [ts-rs](https://github.com/Aleph-Alpha/ts-rs) gegenereerd uit `src-tauri/src/models.rs` (dat gebeurt ook bij elke `cargo test`). Pas een model aan in Rust en draai:
```bash
npm run gen:types
```

### Standalone installer bouwen
```bash
npm run tauri build
```

De installers komen in `src-tauri/target/release/bundle/`. Zie [RELEASING.md](RELEASING.md) voor releases via GitHub Actions en code signing.

---

## 🏗️ Architectuur

| Laag | Locatie | Rol |
|---|---|---|
| Tauri-commando's | `src-tauri/src/commands.rs` | Alle commando's `async`, werk via `spawn_blocking`, `Result<T, String>` |
| Diagnosemodules | `src-tauri/src/*.rs` | Blokkerende, testbare implementaties per onderwerp |
| Proceshelper | `src-tauri/src/shell.rs` | Verborgen PowerShell/cmd, time-outs, JSON-normalisatie |
| API-laag | `src/lib/api.ts` | Getypeerde wrappers rond `invoke` |
| State | `src/store/` | Zustand-stores (diagnose-state, meldingen) |
| i18n | `src/i18n/` | NL/EN-teksten |

---

## ✅ Kwaliteitsbewaking
GitHub Actions (`.github/workflows/ci.yml`) draait bij elke push en pull request:
* **Frontend:** `tsc`, ESLint (incl. `react-hooks`), Vitest en een productie-build.
* **Rust (Windows + Linux):** `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` en een controle dat de gegenereerde TypeScript-types actueel zijn.
