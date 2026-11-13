## What does this change?

<!-- One or two sentences. Link the issue it closes, e.g. "Closes #12". -->

## How was it tested?

<!-- Hardware diagnostics differ per machine, so please be specific. -->

- OS / version:
- Hardware (if relevant):
- Ran as administrator: yes / no

## Screenshots

<!-- For UI changes, before and after. Delete this section if not applicable. -->

## Checklist

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` pass (in `src-tauri/`)
- [ ] Changed `models.rs`? I ran `npm run gen:types` and committed the result
- [ ] New user-facing text exists in both Dutch and English (or I've noted that it still needs translating)
