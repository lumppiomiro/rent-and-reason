# Public edition release notes

Prepared on 2026-11-05 for the initial public source release. This project runs
on the downloader's device; publishing the repository does not host a live game.

## Included

- Lantern Harbor: one fictional board with 40 equal square tiles along a square perimeter.
- Distinct ferry tiles with original boat/wave drawings, and four colored civic
  corners with welcome, office, garden, and inspection symbols.
- 32 original event cards, fictional place names, new property records,
  a new wordmark and lantern favicon, 20 original vector badges, and
  18 optional model/provider pieces with upstream license notices.
- The local edition’s green felt, wood surround, sound mixer, synthesized
  ambience/music, and the same CC0 dice recording.
- The trading engine, auctions, bot players, optional model adapters,
  personality controls, character history, tournaments, and export/import.
- A Model connections screen with ten provider options, saved per-provider keys,
  model discovery, and custom endpoint settings.
- MIT license, content notices, contribution notes, a dependency-free launcher,
  and setup instructions for macOS, Windows, and Linux.
- A clean public `main` history without the personal edition's Git metadata.
- Agent instructions and practical guides for original boards, UI changes,
  game rules, tests, and private-data handling.

## Excluded

Other board editions, commercial board artwork, private preview files,
personal presets, saves, histories, credentials,
logs, backups, and the private edition's Git metadata are not distributed.
Provider names and marks identify optional integrations and playing pieces;
source licenses and notices are bundled.

## Validation

- All **425 automated tests passed** on macOS with Node.js 26.7.0.
- Synthetic bot games completed across multiple seeds in English and Finnish.
- Browser checks verified saving/testing/removing a custom local connection and
  selecting its discovered model for a player.
- Browser checks verified setup, hosted match creation, rolling, bot turns,
  property inspection, and refresh/resume with no browser errors observed.
- Browser checks verified automatic Qwen/Gemma pieces, manual piece overrides,
  the provider badge grid, music toggle, and the recorded dice preview.
- Enlarged property records were visually checked and refined for readability.
- The generated HTML's inline scripts parse, and the build is reproducible.
- The release scan checks the selected public files for excluded board content,
  personal identifiers, machine paths, likely credentials, and runtime data.
- The original project's 256 pre-existing non-hidden files were hash-checked
  and remain unchanged. Runtime data from that project was not copied.

Live cloud inference and remote invitation tunnels were not exercised; their
automated coverage uses test doubles. Windows/Linux launchers and Node.js 22/24
are prepared but were not run on those platforms here. GitHub CI is configured
for Node.js 22 and 24 on Linux. The preview
browser disallows file URLs, so direct-file offline play must be tried manually;
the self-contained build and its scripts passed the build checks.

## Trying the build

Use `npm start`, or the launcher for your operating system. Choose a Human seat
and Programmatic bots for a first test. For an offline trial without Node, open
`index.html` yourself. The public edition uses port 8790 and its own save keys
and data folder.

The ZIP snapshot contains only the public files. Its `.git` and runtime-data
folders are excluded. Keep local runtime data private when sharing updates.
