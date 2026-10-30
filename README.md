# 💻 PC Checker - Cross-Platform Hardware Diagnostics & Health Suite

Een professionele, lichte en razendsnelle desktop applicatie (Windows, macOS, Linux) voor hardware-diagnostiek, systeembewaking, koelingsinspectie en stresstests.

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
* **Desktop PC:** Directe controle van AC Line status, actief Windows Energieplan (Gebalanceerd, Hoge Prestaties) en waarschuwingen voor te agressieve slaapstanden op schijven.

### 3. 🌀 Koeling, Ventilatoren & Thermische Sensoren
* **Temperatuursensoren:** Real-time uitlezing van CPU-kernen, GPU en opslagstations.
* **Ventilatorsnelheden (RPM):** Detecteert actieve ventilatoren via ACPI/WMI en Embedded Controller (EC) status.
* **Throttling Detectie:** Waarschuwt direct met visuele waarschuwingen zodra sensoren boven de 90°C stijgen.

### 4. 🔥 CPU Multi-Core Stresstest
* Live belasting en kloksnelheid per individuele kern.
* Multithreaded floating-point stresstest via `rayon` met score in **MOps/s** (Million Operations/sec).

### 5. ⚡ RAM Integriteit & Bit-Flip Verificatie
* Walking-bit en checkerboard patronen (`0xAA` en `0x55`) over configureerbare geheugenblokken (128 MB tot 512 MB).
* 100% verificatie op pariteitsfouten en instabiel RAM.

### 6. 💾 Schijf Snelheid & Data-Integriteit
* Automatische herkenning van alle volumes (SSD, HDD, NVMe, USB).
* Sequentiële schrijf- en leessnelheidsmeting (MB/s) met byte-voor-byte data-integriteitscontrole.

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
* Noemt waarschijnlijke verdachte drivers op basis van de Driver Check. Dit is géén meting per driver zoals LatencyMon (die ETW-tracing met adminrechten vereist).

---

## 🚀 Aan de slag

### Ontwikkelmodus starten
```bash
npm run tauri dev
```

### Unittests uitvoeren
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

### Standalone Installer bouwen (.exe / .msi voor Windows, DMG voor Mac, AppImage/DEB voor Linux)
```bash
npm run tauri build
```
De kant-en-klare installer wordt geplaatst in `src-tauri/target/release/bundle/nsis/`.

---

## 🤖 Gevalideerd met JARVIS
De volledige testsuite (7/7 tests) is autonoom geverifieerd door **JARVIS** (`d:\projects\JARVIS\agents\jarvis_agent.py`):
* `test_power_and_battery_info`: **OK**
* `test_cooling_and_fans`: **OK**
* `test_freeze_diagnostic_scanner`: **OK**
* `test_system_overview_metrics`: **OK**
* `test_cpu_stress_computation`: **OK**
* `test_ram_integrity_check`: **OK**
* `test_disk_benchmark_and_cleanup`: **OK**
