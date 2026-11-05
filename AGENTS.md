# Instructions for coding agents

These instructions apply to this public checkout of Rent & Reason. Start with
[README.md](README.md), [the source map](docs/DEVELOPMENT.md), and
[customization workflow](docs/CUSTOMIZATION.md). For boards, also read
[the board contract](docs/BOARDS.md).

## Working in this repository

- Work inside the checkout requested by the user. Inspect existing changes
  before editing; preserve unrelated work and other installations.
- Use plain JavaScript and Node.js built-ins. No package installation is needed.
  Discuss substantial architecture or dependency changes with the user.
- Edit source modules, not generated `index.html`. Run `npm run build` and
  commit the regenerated HTML with frontend changes. It must remain usable
  offline, with no remote script, font, or artwork dependency.
- Keep UI decisions in browser modules and legal game actions in `engine.js`.
  Both browser and host use the engine. A model's text is untrusted input and
  must never bypass action validation or gain access to shell/files/tools.
- Preserve numeric property IDs, board identity, deterministic randomness,
  inventory conservation, save validation, and English/Finnish consistency.
  A rule change needs meaningful engine tests and compatible host/AI behavior.
- The current board module implements one edition. Adding a name to `EDITIONS`
  alone does not add a functioning second board. Follow `docs/BOARDS.md`.

## Privacy and content

- Never read or copy a different installation's private data to build fixtures.
  Use synthetic players and games. Do not commit `.rent-reason-data/`, keys,
  environment files, exports, histories, chat, logs, backups, or machine paths.
- Never display credentials in output. Preserve loopback hosting, authenticated
  mutations, server-side key storage, and key redaction from browser responses.
- Use original or appropriately licensed theme text, artwork, and audio. Retain
  upstream licenses and add provenance to `NOTICES.md` for new third-party assets.
  Public examples should create original themes rather than reproduce a
  commercial board's branding, distinctive artwork, or card prose.
- Do not weaken the release scanner to conceal a real privacy/content finding.
  Fix the source or explain a genuine false positive with a narrowly scoped change.

## Validation and delivery

1. Run `npm run build` after frontend edits.
2. Run tests appropriate to the change; run `npm test` for engine, save, host,
   provider, or cross-cutting changes and before a release.
3. Run `npm run release:check` and inspect the actual staged files/diff.
4. For UI changes, inspect the local browser at normal desktop and narrow widths.
   Check focus/keyboard behavior and readable text, not just a screenshot.
5. Report changes, checks, and any untested behavior. Use mocked providers for
   automated checks; do not start paid inference or public tunnels without the
   user's request. Stop preview servers you started when finished testing.
6. Do not push, publish, or deploy unless the user requests that action. Never
   commit another installation's Git history or use `git add --force` on data.

The release scan is a useful check, not a complete secret detector or legal review.
