# Security Policy

PC Checker runs with elevated rights on request (UAC on Windows), starts system processes and reads low-level hardware and event data. We take security issues seriously.

## Supported versions

Only the [latest release](https://github.com/lucius02/pc-checker/releases/latest) receives security fixes. The app updates itself, so please update before reporting.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report it privately through GitHub: go to the [Security tab](https://github.com/lucius02/pc-checker/security) and click **Report a vulnerability**. Please include:

* the version and OS you tested on,
* what an attacker can achieve (for example privilege escalation via the elevation flow, command injection through `shell.rs`, or tampering with the updater),
* steps to reproduce or a proof of concept.

We aim to acknowledge reports within a week and will keep you updated while we work on a fix. With your permission, we'll credit you in the release notes.
