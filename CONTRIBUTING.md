# Contributing to PC Checker

Thanks for helping out! PC Checker is a small project, so every contribution matters, whether it's a bug report from your machine, a translation fix or a whole new diagnostic module.

You don't need to speak Dutch. Issues, pull requests and discussions in English are welcome. Parts of the code and comments are still in Dutch. Translating them as you go is a contribution in itself.

## Ways to contribute

| You are… | Good first contributions |
|---|---|
| **A user** | Report what PC Checker gets wrong on your hardware with the *Hardware report* issue template: wrong temperatures, missing fans, a false "Critical" verdict. These reports are gold. |
| **A React / TypeScript developer** | UI polish, accessibility, charts, new peripheral tests (all browser APIs, no Rust needed), Vitest tests for `src/lib` and `src/utils`. |
| **A Rust developer** | Linux and macOS implementations of Windows-only modules, new freeze patterns, performance, tests. |
| **A sysadmin / support person** | Freeze causes and fix advice: Windows events, BugCheck codes, `journalctl` patterns. See `src-tauri/src/freeze_advice.rs`. |
| **A translator** | English wording, and translating Dutch comments and docs. |

Browse [good first issues](https://github.com/lucius02/pc-checker/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and [help wanted](https://github.com/lucius02/pc-checker/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22). Comment on an issue to claim it so nobody duplicates your work. For larger changes, open an issue or a [discussion](https://github.com/lucius02/pc-checker/discussions) first, so we can agree on the approach before you spend time on it.

## Development setup

1. Install **Node.js 22+**, **Rust (stable)** and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS. On Debian/Ubuntu that is:
   ```bash
   sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev libssl-dev build-essential
   ```
2. Fork and clone the repo, then:
   ```bash
   npm install
   npm run tauri dev
   ```
   The first build compiles the Rust side and takes a few minutes. After that it's incremental.

### Before you open a pull request

CI runs all of these, so run them locally first:

```bash
npm run typecheck
npm run lint
npm test
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

If you changed a struct in `src-tauri/src/models.rs`, regenerate the TypeScript types and commit them:

```bash
npm run gen:types
```

## How the code fits together

A diagnostic flows through five layers. Battery info as an example:

1. **Module** `src-tauri/src/power.rs`: a plain, blocking function `get_power_and_battery_info() -> Result<PowerInfo, String>`. Platform-specific code lives behind `#[cfg(target_os = "...")]`. Keep it testable: parse command output in a pure function and test that function with sample output.
2. **Model** `src-tauri/src/models.rs`: the `PowerInfo` struct with `#[derive(TS)]`. ts-rs generates `src/types/generated/PowerInfo.ts` from it.
3. **Command** `src-tauri/src/commands.rs`: an `async` wrapper that runs the module on a worker thread via `blocking(...)`. Register it in the `invoke_handler` list in `src-tauri/src/lib.rs`.
4. **API** `src/lib/api.ts`: `getPowerAndBatteryInfo: () => invoke<PowerInfo>("get_power_and_battery_info")`.
5. **UI** `src/components/tabs/PowerTab.tsx` plus `src/components/Navigation.tsx` (sidebar entry) and `src/App.tsx` (render). Strings go in `src/i18n/tabs/<tab>.ts`.

### Conventions

* **Never block the UI thread.** Long work goes through `blocking(...)` in `commands.rs`.
* **Never invent data.** If a value can't be read, return `None` or "Unknown". A wrong reading is worse than a missing one.
* **External processes** go through `src-tauri/src/shell.rs` (hidden window, hard time-out). Don't call `std::process::Command` directly.
* **Two languages, always.** Text from Rust uses `tr!("Nederlands", "English")`. Frontend strings need a key in both the NL and EN dictionaries (`src/i18n/i18n.test.ts` fails otherwise). If you don't speak Dutch, put the English text in both and mention it in your PR, and a maintainer will translate it.
* **Status codes are Dutch strings** (`"Goed"`, `"Let op"`, `"Kritiek"`, …) because the frontend compares on them. Use the existing constants rather than new strings.
* **Errors surface to the user.** Commands return `Result<T, String>` with a readable message.
* New code and comments may be in English.

## Pull requests

* Keep PRs focused: one feature or fix per PR. Small PRs get reviewed much faster.
* Use [Conventional Commit](https://www.conventionalcommits.org/) style titles: `feat(linux): read fan speeds from hwmon`, `fix: …`, `docs: …`.
* Describe **what you tested and on which OS and hardware**. Hardware diagnostics behave differently on every machine, so that context matters.
* Add screenshots for UI changes.
* PRs need green CI and one maintainer review. We aim to give first feedback within a few days. If it goes quiet, a friendly ping is welcome.

## Reporting bugs and security issues

* Bugs and hardware misreadings: [open an issue](https://github.com/lucius02/pc-checker/issues/new/choose). The exported **JSON report** (*Export report → JSON*) helps a lot. Check it for anything you don't want to share first.
* Security vulnerabilities: please **don't** open a public issue. See [SECURITY.md](SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind. Everyone here is volunteering their time.

## License

By contributing, you agree that your contributions are dual licensed under the [MIT](LICENSE-MIT) and [Apache-2.0](LICENSE-APACHE) licenses, like the rest of the project, without any additional terms or conditions.
