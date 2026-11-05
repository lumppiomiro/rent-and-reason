# Contributing

Fork the project, create a branch, and describe the behavior your change fixes
or adds. Use synthetic players and state in tests. Include screenshots for UI
changes with no private names, conversations, keys, or saved-game data visible.

Coding agents should read [AGENTS.md](AGENTS.md). Start with
[the customization workflow](docs/CUSTOMIZATION.md) and, for board work,
[the board authoring contract](docs/BOARDS.md). A cosmetic theme, a new selectable
edition, and a rule change require different scopes; describe which you intend.

Before a pull request, run:

```sh
npm run build
npm test
npm run release:check
```

Commit updated `index.html` with frontend changes so offline play stays current.
Do not commit runtime data, credentials, exported games, logs, or third-party
board reproductions. New artwork and text must be original or appropriately
licensed, with notices retained. Keep the dependency-free setup unless a change
has a clear benefit worth the added installation cost.

Describe validation and any limitations in the pull request. AI provider changes
should use mocked tests; do not require reviewers to pay for inference. Opening
an issue or pull request does not authorize sending private provider logs.
