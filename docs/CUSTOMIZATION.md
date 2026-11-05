# Customize Rent & Reason with a coding agent

You can fork the repository, edit it yourself, or ask a local coding agent to
work in your copy. The agent is optional; the game itself needs no coding agent.
Read [AGENTS.md](../AGENTS.md) for repository conventions and
[DEVELOPMENT.md](DEVELOPMENT.md) for the source map.

## Start with an isolated copy

Download and extract the repository ZIP, or fork it and clone your fork. Keep
that copy separate from an installation with games you care about. If using Git,
make a branch before editing:

```sh
git switch -c my-customization
```

Open that project folder in your coding agent and describe the result you want.
Do not give it API keys, private histories, or access to unrelated project folders.
If a change affects save formats, keep a private backup before trying it against
existing games. A clean test installation is preferable for early experiments.

## Example: an original board theme

Copy this into your agent and replace the bracketed brief:

> Read AGENTS.md, docs/DEVELOPMENT.md, and docs/BOARDS.md first. Retheme the
> included board around [my fictional town or original city-inspired setting].
> Write original place names, event-card prose, and SVG symbols. Keep the current
> game rules, numeric tile IDs, prices, card effects, and English/Finnish behavior
> unless I request a rule change. Update the board description sent to models and
> all visible theme labels. Preserve offline play and keep private data out of
> files and screenshots. Rebuild index.html, run the relevant checks, and show me
> the result locally. Do not publish or start paid model calls.

Start with a retheme of the existing edition. Multiple selectable boards need
additional implementation; [BOARDS.md](BOARDS.md) explains where.

Use artwork and writing you created, have permission to adapt, or can use under
a suitable license. Keep license notices with redistributed assets. The MIT
license covers this project's code and original assets; it does not grant rights
to unrelated commercial games, provider trademarks, or model services.

## Example: a UI improvement

> Read AGENTS.md and docs/DEVELOPMENT.md. Change [specific screen or interaction]
> so that [desired behavior]. Keep the existing game rules and saved-game
> compatibility. Use the established CSS/SVG system and preserve keyboard access,
> English/Finnish labels, and narrow-screen usability. Rebuild the standalone
> HTML, check it locally, and report what you tested. Do not publish.

## Example: a gameplay rule

> Read AGENTS.md and the engine/economy source. Implement [precise rule, including
> when it applies and one before/after example]. Explain its effect on human,
> programmatic-bot, and model-controlled turns. Add meaningful synthetic tests
> for the new rule and edge cases, preserve inventory and save validation, and
> update the rules guide and AI context. Run the full suite and release scan.
> Do not use live provider calls or publish.

For model-provider work, consult [MODELS.md](MODELS.md), `model-providers.js`,
`connections-ui.js`, and the relevant `ai/` adapter. Validate model responses
through the shared game engine and test using mocks.

## Run and review the result

```sh
npm run build
npm test
npm run release:check
npm start
```

Node.js 22 or newer is required for these commands; no `npm install` is needed.
Open the URL printed by the launcher. If another copy is already running, use
the alternative-port instructions in [SETUP.md](SETUP.md#port-already-in-use).
Backend changes need a host restart. Rebuilding and refreshing loads frontend
changes. Stop your test host with Control-C when finished.

Check a new game, property records, dice/movement, card text, save/resume, and
both interface languages. For visual edits, inspect the full board and smaller
screens; for mechanics, verify auctions, trades, debt, and bankruptcy as relevant.

Before sharing, inspect `git status`, `git diff`, and `git diff --cached`.
Do not share your runtime folder or exported games. A GitHub source ZIP does not
include ignored local data; zipping your entire working folder can include it.
The release scan provides an additional check but cannot detect every secret.
See [CONTRIBUTING.md](../CONTRIBUTING.md) to submit a change upstream.
