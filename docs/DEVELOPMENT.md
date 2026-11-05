# Architecture and customization

This is a standalone, dependency-free JavaScript application. `build.mjs` embeds
source modules, CSS, and the original favicon into `index.html`. Node runs the
same game engine for hosted tables. Generated HTML is included for no-install
play; edit the source files and rebuild rather than editing it directly.

| Files | Responsibility |
| --- | --- |
| `boards.js` | Lantern Harbor's 40 spaces, prices, original cards, language text, and AI board descriptions |
| `engine.js`, `economy.js` | Deterministic game state, seeded randomness, legal transactions, debt and rent |
| `view.js`, `art.js`, `harbor.css` | Square board geometry, property records, original badge vectors, theme |
| `provider-pieces.js`, `assets/provider-logos/` | Offline model/provider marks and pinned license provenance |
| `feedback.js`, `assets/audio/` | Local sound engine, music, ambience, and CC0 dice recording |
| `app.js`, `shell.html`, `*-ui.js` | Browser UI and game interactions |
| `lobby-model.js`, `lobby-ui.js` | Setup drafts and the home / character / history views |
| `model-providers.js`, `connections-ui.js`, `ai/compatible.cjs` | Provider definitions, in-app setup, and shared compatible API adapter |
| `server.cjs`, `launch.cjs` | Local host, authenticated routes, launcher |
| `ai/` | Provider adapters, strategy context, negotiation, memories, usage and archives |
| `tests/` | Regression tests with synthetic fixtures and model doubles |

## Making an original theme

See [the detailed board contract](BOARDS.md) for tile roles, card effect schemas,
identity and save considerations, and adding multiple editions. For a coding
agent workflow and example prompts, read [CUSTOMIZATION.md](CUSTOMIZATION.md).

Start with `boards.js`. Keep each square's numeric ID consistent across the
board, card movement targets, and engine rules. Its `get`, `cards`, `descriptor`,
and `prompt` functions keep the browser and model instructions synchronized.
The current engine uses 40 spaces, 16 cards per deck, four ferry routes, two
cooperatives, and eight developable districts. Changing that topology needs an
engine change as well as a visual change; changing prose and visuals does not.

Create your own locations, card writing, names, and artwork, or use assets whose
licenses allow your intended distribution. Record asset provenance in NOTICES.
Add tokens in `art.js` and the engine's `PIECES` list. Never embed credentials or
exported user games as fixtures. Tests should build synthetic state in code.

The UI uses “workshop / landmark” and “Permit Review”; legacy implementation
keys such as `jail`, `chance`, and `chest` describe engine mechanics, not extra
board editions. `completeSet()` checks district ownership. Prices, rent schedules,
and engine rule effects are explicit, so a theme can be inspected and modified.

## Local development

Run `npm run build` after editing frontend code, then refresh the browser. Restart
the host after backend changes. For scripted checks, `RENT_REASON_OPEN_BROWSER=0
npm start` disables automatic browser opening. No bundler, package install,
account, or external database is required.

Run `npm test` before submitting changes. These tests include temporary localhost
servers and therefore need permission to bind loopback ports in sandboxed tools.
No model inference or external tunnel is required by the regression suite.

## Preparing a distributable

Run `npm run build`, `npm test`, and `npm run release:check`. The release checker
verifies the public file set, names, suspicious credential patterns, and embedded
HTML. Its exclusion rules also define the files suitable for an archive.
Ignored runtime folders must never be added with `git add --force`.

A clean source checkout plus the generated `index.html` is sufficient. Before
publishing, inspect `git diff --cached` and `git ls-files`. Use your GitHub
no-reply commit email if you do not want a personal email in commit metadata.
Do not publish an archive of the entire parent workspace or your local data.
