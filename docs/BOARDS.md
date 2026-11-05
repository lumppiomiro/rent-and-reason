# Board authoring contract

This guide describes the implementation that ships today, not a plugin API.
`boards.js` implements a single immutable edition, Lantern Harbor. A new theme
can replace its original writing and visuals in a fork. Multiple selectable
editions require extending data dispatch and presentation as described below.

## Files to change together

| File | Board responsibility |
| --- | --- |
| `boards.js` | Metadata, tile data, decks, translations, currency helpers, model context |
| `view.js` | Tile geometry, ferry/corner pictograms, central board labels, property records |
| `art.js`, `harbor.css` | Original badge art, wordmark, colors and presentation |
| `lobby-ui.js`, `edition-ui.js`, `lobby-model.js` | Setup, edition selection, default identity and preview labels |
| `engine.js`, `economy.js` | Rules and calculations; inspect before changing topology or economic meaning |
| `fi.js`, `lobby-fi.js`, other `*-fi.js` | Interface translations; search for the English label you change |
| `tests/public-edition.test.cjs`, `tests/engine.test.cjs` | Edition contract and engine regression checks |

Search all references to a changed board ID, label, currency, or rule. Some
engine logs, help text, host prompts, launch text, and presentation labels mention
the current town directly. Renaming a tile in one array is not a complete retheme.

## Preserve the board contract for a visual retheme

The engine and save validator assume 40 tiles with contiguous numeric IDs 0–39.
Helpers in `boards.js` assign IDs by insertion order. Keep these roles in place:

| IDs | Type / purpose |
| --- | --- |
| 0 | `go`: circuit start and salary |
| 10 | `jail`: Permit Office / review destination |
| 20 | `parking`: Common Green / optional common fund |
| 30 | `gotojail`: send the player to review |
| 5, 15, 25, 35 | `rail`: ferry routes |
| 12, 28 | `utility`: cooperatives |
| 7, 22, 36 | `chance`: Tide & Turn draw spaces |
| 2, 17, 33 | `chest`: Town Dispatch draw spaces |
| 4, 38 | `tax`: levies, with an `amount` |
| Remaining IDs | `street`: developable properties |

District membership is brown: 1/3; sky: 6/8/9; pink: 11/13/14;
orange: 16/18/19; red: 21/23/24; yellow: 26/27/29; green: 31/32/34;
blue: 37/39. These internal keys map to the muted palette in `engine.js`.

A street has a name, district key, purchase price, six rents (base, one through
four workshops, landmark), and a per-level development cost:

```js
street('Willow Workshop', 'brown', 60, [2, 10, 30, 90, 160, 250], 50);
```

This is an example replacement for a street at its existing insertion position,
not an extra tile to append. Keep values unchanged for a purely visual theme.
Ferry and utility rents are calculated by the engine rather than a street rent
array. The current bank starts with 32 workshops and 12 landmarks. Development
levels are 0–5; moving to level 5 returns four workshops to the bank.

## Event decks

There are 16 entries in each deck. English entries store text plus an effect;
Finnish text arrays use the same index and share that effect. Preserve indices
and effects when rewriting prose, including the amount and destination described.

| Entry after the text | Effect |
| --- | --- |
| `'move', tileId` | Travel forward to a tile, then resolve the landing |
| `'rail'` | Travel to the next ferry, with the deck's doubled-fare modifier |
| `'utility'` | Travel to the next cooperative, with a fresh dice roll and 10× modifier |
| `'back', steps` | Move backward without a salary, then resolve the landing |
| `'jail'` | Enter review at tile 10 without a circuit salary |
| `'free'` | Keep a release pass out of circulation until used |
| `'cash', signedAmount` | Receive positive cash or owe a negative amount to the bank |
| `'payall', amount` | Pay each other active player |
| `'collectall', amount` | Collect from each other active player |
| `'repairs', perWorkshop, perLandmark` | Pay for the player's current developments |

Changing an effect is a rule/economy change and needs corresponding tests.
Update `deckName()`, `descriptor()`, and `prompt()` so model players see the same
names, rules, and card effects as humans. Never substitute instructions for
executing code or bypassing action validation into model context.

## Identity, languages, and saved games

`Boards.get(state)` returns immutable tiles annotated with `boardId`, `language`,
`key`, and `currency`. `cards()`, `cardText()`, `rules()`, `descriptor()`, and
`prompt()` must agree on the edition. Currency formatting also uses `currency()`,
`symbol()`, and `moneyText()`; the current implementation uses USD throughout.
Changing metadata alone does not implement a new currency.

For a local cosmetic experiment, keeping the current ID avoids changing default
selection, but old saves will then display the new theme. For a separately
distributed edition, choose a new stable ID, update every default and consumer,
and define whether older saves are supported. Do not silently reinterpret an old
save with different property semantics. Bumping metadata `version` alone does
not provide migration logic.

## Adding a second selectable board

Adding an `EDITIONS` entry is insufficient: `get()` currently returns one `BOARD`,
`cards()` selects one deck pair, and `descriptor()` uses the default metadata.
Implement per-edition board/deck/rule/description dispatch and cache keys. Then
update setup previews, selection, visible names, defaults, and board rendering
to use the chosen descriptor rather than hard-coded town text.

Keep numeric topology consistent initially. Supporting a different tile count,
corner destination, district layout, deck size, or inventory requires auditing
the engine, economy, geometry, save validation, host/AI context, and tests.
Some tests intentionally assert the shipped single-board contract; update those
assertions only when adding actual multi-board support, and keep regression
coverage for the original edition.

Test both editions through setup, seeded bot games, card destinations, auctions,
trades, development, debt, bankruptcy, and save/resume. Verify the host and
standalone HTML agree and that English and Finnish retain identical mechanics.

## Original assets and verification

Draw new icons with the existing SVG system or use assets licensed for your
intended distribution. Write original card prose and record third-party sources
in `NOTICES.md`. See [CUSTOMIZATION.md](CUSTOMIZATION.md) for an agent prompt.

Run `npm run build`, `npm test`, and `npm run release:check`. Inspect the board
and property records in the browser, including ferry/corner focus and hover.
Commit the rebuilt `index.html` with source changes. Keep generated games,
characters, credentials, and personal screenshots outside the public tree.
