# Security

## Scope

This is a static-site generator you run yourself — locally, or in your own CI. There is no
hosted service operated by this project, no account system, and no shared infrastructure.
A security issue here means a bug in the code you run, not an incident affecting other
users' data, because there is no shared data to affect.

See [docs/privacy.md](docs/privacy.md) for what the project does and does not do with your
information.

## Reporting a vulnerability

Please report privately rather than opening a public issue, using GitHub's
[private vulnerability reporting](https://github.com/NITISH-R-G/Portfolio/security/advisories/new)
for this repository. Include what you found, how to reproduce it, and its impact if you can
assess one.

You should get an acknowledgement within a few days. This is a personal open-source project
maintained outside working hours, not a funded security team — please plan for a response
time measured in days, not hours.

## What is worth reporting

- A way for connector or document-import code to execute arbitrary code from untrusted
  input (a crafted API response, a crafted résumé file).
- A credential in `.env` being read, logged, or bundled into the built site where a visitor
  could retrieve it.
- A private field (`identity.contact.phone`, an unpublished document) ending up in generated
  output — `dist/`, an export, or a JSON-LD block — despite not being configured to appear.
- A path-traversal or injection issue in the local dev-server write API
  (`scripts/lib/devApi.mjs`), which only listens on `localhost` but should still not trust
  its input.

## What is not a project vulnerability

- A platform's own API misbehaving, rate-limiting, or leaking data through its own bugs —
  report that to the platform.
- Anything requiring an attacker to already control your `.env` file, your machine, or your
  CI secrets. At that point the credentials were already theirs.
- The generated site exposing data you configured it to show. Every connector fetches only
  public data by design; if a value is visible, it is because the source made it public or
  you typed it in yourself.

## Dependencies

Dependabot is enabled on this repository. Security updates to dependencies are reviewed and
merged as they arrive rather than on a fixed schedule.
