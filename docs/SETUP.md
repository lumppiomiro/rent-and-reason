# Setup and troubleshooting

## First check

In a terminal, run `node --version`. It must report 22 or newer. Close and reopen
your terminal after installing Node if the command is missing. Open a terminal
in the directory containing `package.json`, then run `npm start`.

The launcher rebuilds the HTML, starts the host, and opens your browser. A working
launch prints `Rent & Reason · Lantern Harbor` and a `127.0.0.1` address. Use that
exact address, including the port. Do not replace it with a LAN IP or `localhost`.

If you only want offline bots, open `index.html` directly; no installation is
needed. Use a current Chrome, Edge, Firefox, or Safari browser. The viewport
adapts to smaller screens, but the dense board is easiest to read on a laptop.

## Starting your first game

1. Choose **Set the table** (or **Start a new game** if you have a save).
2. Keep **Lantern Harbor**, **Take a seat**, and 2–4 players.
3. On **The players**, leave seat 1 as Human and the others as Programmatic bot.
4. Choose a different badge and color for each player. Player names are yours
   to edit; no real-person profiles are bundled.
5. On **Rules & review**, choose a round limit for a short trial or play until
   one player remains. Confirm replacement if you already have an active game.
6. Choose **Create game**. Follow the introduction screen, then roll the dice.

Click a property to read its record. **Table controls** contains game settings,
AI controls, import/export, and the rules guide. Models and hosted bots can be
paused; in standalone play the built-in opponents advance automatically.

## Port already in use

This edition defaults to port **8790**. If it is busy, choose another port:

macOS / Linux:

```sh
RENT_REASON_PORT=8791 npm start
```

Windows PowerShell:

```powershell
$env:RENT_REASON_PORT = '8791'
npm start
```

A launcher with a busy port exits without replacing the other process. Stop
only the terminal running the game you intend to stop. Browser storage is
separate for each port, while this folder's hosted saves remain the same.

## Models do not appear

Open **Model connections**, choose the provider, and use **Save & connect** or
**Test connection & load models**. API keys can be entered here; no terminal key
helper is required. Return to player setup to choose the provider and model.

For Ollama or LM Studio, install/load a capable text model in that app first and
start its local server. The game does not download models. Check the displayed
server base URL. See [Models](MODELS.md) for details.

Codex and Claude Code still use official CLI sign-ins; the connection screen
links to installation instructions and checks the sign-in. To select a CLI outside
PATH, set `RENT_REASON_CODEX_BIN` or `RENT_REASON_CLAUDE_BIN` before starting.
The direct OpenAI API option uses a separate API key rather than a subscription.

For custom servers without a `/models` endpoint, enter exact model IDs under
**Advanced settings**. Authentication failures are never bypassed by manual IDs.
If a model rejects structured output, choose a response format that its server
supports. A model appearing in a list does not guarantee game compatibility.

## Changes do not appear

Stop the game with Control-C. Start it again with `npm start`, then refresh your
browser. The launcher rebuilds the standalone file and loads the new backend.
A hosted saved game resumes paused. Keep backups before editing saved data.

## Sound does not play

Click or tap a game control once so the browser can unlock audio. Check
**Sound & pace**, the game volume, and your browser's tab mute setting. Optional
music and ambience start off. Background tabs pause or soften sound.

## Saves and moving to another device

Use **Export save** and **Load** for games. Exported games can include dialogue
and private strategy notes, so inspect them before sharing publicly.

To back up the complete local character and match library, stop the host and
make a private copy of `.rent-reason-data/`. Do not put it in a public repository.
Moving a macOS Keychain marker does not move the API key: save your key again on
the destination device. A new installation requires its own provider sign-ins.

## Inviting friends

Single-device pass-and-play and remote invitations use the local Node host.
Choose Human for additional seats. For remote friends, the optional **Host
online** flow needs `cloudflared` installed separately. It creates a temporary
external tunnel and individual seat invitations; it is not a permanent hosting
or matchmaking service. Share invitation links only with the intended players.
Keep the host terminal open. Stop hosting from its control to end remote access.
If you do not need remote friends, leave this feature off.

## Starting fresh

For a new match, use **New game**; you do not have to delete any files. To reset
all hosted history, stop the host and move `.rent-reason-data/` into a private
backup directory. Start again to create a fresh library. Browser preferences
and standalone saves are separate and can be cleared in browser site settings.
