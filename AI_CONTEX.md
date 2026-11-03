# AI_CONTEX.md — Diep-style LAN Browser Game

> **Purpose:** Compact handoff document for every AI coding session. Read this before changing code. Update it in every patch. Keep it factual and short enough to fit comfortably in a limited context window.

**Project status:** First playable LAN prototype implemented; automated tests pass in an AI sandbox; NOT yet tested in a real browser or on real devices  
**Last verified:** 2026-11-03  
**Repository:** Not provided to the AI; Session 1 was built from scratch against a baseline commit containing only `AI_CONTEX.md`  
**Current branch / commit:** Unknown — record your real commit after applying the Session 1 patch  
**Release:** Pre-alpha; `npm test`/`typecheck`/`build` pass in sandbox; no device-tested build

## 1. One-paragraph vision

Build a browser-based, top-down tank arena game inspired by Diep.io. A laptop runs the game server locally. The laptop can connect to a phone's Wi-Fi hotspot, and other PCs and phones on that same hotspot/LAN join by opening the laptop's local IP address in a browser. No public hosting, paid backend, native mobile app, or internet-facing server is required for the first playable version. Desktop and mobile players must be able to play in the same match.

Use original implementation and original/simple visual assets. Diep.io is a gameplay reference, not a source-code or asset source.

## 2. Product requirements

### Must have
- Browser game; responsive on desktop and mobile browsers. Mobile should work in landscape and remain usable on small screens.
- Laptop-hosted LAN multiplayer. The server listens on `0.0.0.0`, not only `127.0.0.1`.
- A single local HTTP + WebSocket endpoint/port where practical. Initial default port: `3000` (make configurable).
- Join through `http://<laptop-LAN-IP>:3000`; show clear host/join instructions and the host's LAN address where it can be detected safely.
- Desktop controls: keyboard movement and mouse aim/fire.
- Mobile controls: touch movement and touch aiming/firing; controls must not depend on hover or keyboard.
- Server-authoritative multiplayer: server owns position/simulation, collisions, damage, health, XP, levels, upgrades, spawns, and match state. Clients send inputs and render snapshots; clients must not decide outcomes.
- Core loop: destroy shapes / opponents, earn XP, level up, spend stat points, evolve tanks, survive and compete on a leaderboard.
- Eight upgrade stats: health regeneration, max health, body damage, bullet speed, bullet penetration, bullet damage, reload, movement speed.
- Level progression target: levels 1–45, with class choices around levels 15, 30 and 45. Keep thresholds/configuration data-driven.
- Initial modes: FFA first. Team modes and other modes are later milestones.
- No paid APIs or hosted services in the core game.

### Nice later (not required for first playable build)
- PWA/install prompt, accounts, persistent profiles, saved statistics, chat, cosmetics, multiple rooms/modes, public internet hosting, matchmaking, advanced bosses and anti-cheat telemetry.

## 3. Baseline technical direction

Use this as the default unless the repository already has a sound, working alternative. Do not change stack casually between AI sessions.

- **Client:** TypeScript + HTML Canvas (2D), responsive HTML/CSS HUD.
- **Server:** Node.js + TypeScript.
- **Realtime transport:** WebSocket (for example, the `ws` package).
- **HTTP:** Serve the built client and WebSocket endpoint from the laptop-hosted Node server on the same port in the LAN build.
- **Deployment:** Run locally on Windows first. No cloud dependency. Other devices connect over the local network.
- **Simulation:** Fixed-timestep authoritative server simulation; clients render smoothly and interpolate snapshots. Keep simulation rules in shared/testable modules where sensible.
- **Data:** Tank classes, upgrade paths, stats, shapes and balance values should be data-driven rather than duplicated across many files.

Suggested folder boundaries (adapt to the real repo; do not reorganize without a clear benefit):
- `src/client/` — canvas renderer, camera, input adapters, HUD and mobile controls.
- `src/server/` — HTTP/WebSocket server, rooms, authoritative simulation, player lifecycle.
- `src/shared/` — protocol types, constants, configs and shared pure logic.
- `tests/` — unit/integration tests for progression, combat and protocol logic.

## 4. Network model and LAN join flow

1. The host starts the Node server on the laptop.
2. The server binds to `0.0.0.0:<port>` so other devices can reach it.
3. The laptop joins the phone hotspot (or a common Wi-Fi router).
4. Players on that same hotspot/LAN open `http://<laptop-IPv4>:3000` on a PC or phone.
5. The browser loads the game from the laptop and opens a WebSocket to the same host/port.

Windows may ask for permission to allow Node.js through the firewall; allow it on **Private networks** for the trusted hotspot/LAN. Do not recommend exposing the port to the public internet or configuring router port forwarding for the LAN version.

**Known network caveat:** Hotspot implementations differ. Some isolate clients or prevent the phone providing the hotspot from reaching a connected laptop. Test laptop-to-laptop, another phone-to-laptop, and (optionally) hotspot-owner-phone-to-laptop separately. If peer-to-peer access is blocked, report it as a network/hotspot limitation and offer a common Wi-Fi router or a hotspot setting that permits local-device communication. Do not claim every phone hotspot supports this.

## 5. Gameplay scope and rules

### First playable milestone
- Join screen with nickname and connection status.
- One arena and one FFA room.
- Tank movement, rotation/aim, firing and collision.
- Basic shapes with health, respawn and XP rewards.
- Player health, death/respawn, score and leaderboard.
- Leveling and the eight stat upgrades.
- At least the Basic Tank plus a small, working selection of upgrade classes.
- Desktop and mobile input both work in the same match.

### Later gameplay milestones
- Complete class evolution tree and class-specific weapon types (multi-barrel bullets, sniper, drones, traps, recoil/ramming, auto turrets, minions, etc.).
- Crashers and boss encounters.
- Team modes, Maze, Domination, Sandbox and other variants.
- Balance tuning, effects, sound and polish.

Do not implement a large class tree before the basic multiplayer combat/progression loop is stable.

## 6. Roadmap / current status

Status key: `TODO` = not implemented; `IN_PROGRESS` = actively being implemented; `DONE` = verified in the repository and/or by a stated test; `BLOCKED` = waiting on a concrete dependency. Never mark something `DONE` only because code was proposed or generated.

| ID | Milestone | Status | Evidence / notes |
|---|---|---|---|
| M0 | Confirm repository, branch, existing code and current commit | TODO | Still no repo visible to the AI. If your repo already has code, reconcile before merging Session 1. |
| M1 | Project scaffold, scripts, TypeScript build and basic documentation | DONE | Sandbox: `npm run typecheck`, `npm run build`, `npm test` pass (Node 22). README added. |
| M2 | Canvas arena, camera, responsive rendering | IN_PROGRESS | Implemented (`src/client/render.ts`, DPR/resize/orientation); bundles OK; never run in a browser. |
| M3 | Local tank movement, aiming, shooting and collision | IN_PROGRESS | Server sim (movement, firing, collisions) unit-tested; no client-side prediction (input is ~100 ms interpolated); no offline/local mode. |
| M4 | Shapes, damage, XP, leveling and eight stats | IN_PROGRESS | Server logic covered by `tests/game.test.ts` + `progression.test.ts`; HUD (xp bar, upgrade panel, leaderboard) untested in browser. Balance is a first guess. |
| M5 | Tank classes and upgrade/evolution configuration | IN_PROGRESS | Data-driven `CLASSES` in `src/shared/config.ts`: basic, 4 tier-1 (L15), 4 tier-2 (L30). Level-45 tier TODO. Only bullet barrels (no drones/traps). |
| M6 | Node LAN server + WebSocket + server-authoritative match | IN_PROGRESS | `tests/server.test.ts`: real HTTP+WS join/snapshot/input/cleanup on loopback; real process served 200 via non-loopback IP (bind 0.0.0.0). Not tested across a real hotspot. |
| M7 | Desktop + mobile input and mixed-device playtest | IN_PROGRESS | Keyboard/mouse + dual floating touch sticks implemented (`src/client/input.ts`). No device or browser test performed. |
| M8 | Join instructions, LAN IP display, Windows firewall/run scripts | IN_PROGRESS | Console + join-screen LAN URLs, `start_server.bat`, `allow_firewall_private.bat`, README. `.bat` files never executed on Windows. |
| M9 | NPCs, bosses and additional game modes | TODO | Not inspected / not verified. |
| M10 | Performance, security, balancing and release packaging | TODO | Not inspected / not verified. |

## 7. Known risks / weak points to track

- **LAN reachability:** Phone hotspot client isolation, firewall rules, changing laptop IP, and different Android/iOS hotspot behavior.
- **Mobile UX:** Touch controls, landscape layout, browser address-bar resizing, pointer cancellation and preventing accidental page scrolling/zooming while playing.
- **Network quality:** Latency, packet loss, reconnects, stale players and server overload. Keep the server authoritative and validate every input.
- **Performance:** Canvas draw cost, collision checks, too many projectiles/entities, unnecessary per-frame allocations and excessive WebSocket snapshots.
- **Cheating / robustness:** Never trust client-reported position, damage, XP or cooldowns. Validate message types, sizes, rates and player ownership.
- **AI handoff drift:** Different AI accounts may invent architecture or claim tests they did not run. This file and the actual repository are the source of truth.
- **Unverified facts:** The user's real repo/branch/commit are unknown (M0). Client code has only been type-checked and bundled, never executed in a browser.
- **Feel/netcode:** No client-side prediction; own tank is rendered ~100 ms behind. Snapshots are full-state JSON at 30 Hz (~2.2 KB per player at 24 busy players in sandbox sim); fine for LAN, revisit before more players.
- **Balance:** All numbers in `config.ts` / `progression.ts` are untuned guesses. Bullet-vs-bullet collision is not implemented.

## 8. Decisions and open questions

### Decisions already made
- Browser-based game; PC and mobile browsers play together.
- Local multiplayer over phone hotspot / shared LAN; laptop hosts the server.
- Free-tier AI workflow; small, focused changes to conserve context/tokens.
- AI cannot edit the working directory directly. All code changes must be delivered as a Git patch.
- Preferred default stack: TypeScript, Canvas, Node.js and WebSockets, unless the existing repo gives a strong reason otherwise.
- Implemented stack: Node >=22, `ws`, `tsx` (server runs TS directly, no server build), `esbuild` bundles client to `dist/public`, tests via built-in `node:test`. `package-lock.json` is included (generated with npm 10.9 in the sandbox).
- Server: 30 Hz fixed step, uniform-grid collisions, 3200x3200 arena, 24-player cap, per-connection rate limit (90 msg/s, kill at 600), 256-byte messages, view-culled snapshots (+/-1000 units).
- Progression: 1 stat point per level 2-28 then every 3rd level from 30 (33 total), 7 levels per stat; death resets to level 1 with 3 s spawn protection. Class choice via `{t:'class'}` validated by parent+minLevel.
- Mobile controls chosen: left-half floating move stick, right-half floating aim stick (aim past deadzone = fire). Upgrades/classes via on-screen buttons.

### Open / decide when needed
- Exact repo URL, branch and existing implementation (M0).
- Mobile control feel: dual sticks implemented; compare against touch-to-aim/auto-fire after a real phone test.
- Target player count and arena size; measure before choosing hard limits.
- Whether the hotspot-providing phone itself must also join the match; this depends on hotspot routing behavior.
- Whether the first release needs only FFA or also team mode.

Use sensible defaults for non-blocking details. Do not stop implementation to ask about every cosmetic or balance value.

## 9. AI session handoff log

Add one newest-first entry after every meaningful session. Keep each entry concise and factual.

### Session template
- **Date / AI session:** YYYY-MM-DD — short identifier
- **Goal:**
- **Changed:** files and behavior
- **Verified:** commands/tests actually run and results
- **Not verified:** anything not run or requiring device testing
- **Weak points / regressions:**
- **Next 1–3 tasks:**

### Session 1 — first playable LAN prototype (2026-11-03)
- **Goal:** Do as many roadmap items as possible with no repo available: scaffold, server-authoritative sim, client, LAN scripts, tests.
- **Changed:** New: `package.json`, `tsconfig.json`, `scripts/build-client.mjs`, `src/shared/{config,progression,protocol}.ts`, `src/server/{game,grid,net,server,index}.ts`, `src/client/{index.html,main,input,render}.ts`, `tests/*`, `start_server.bat`, `allow_firewall_private.bat`, `README.md`, `.gitignore`. Behavior: FFA arena, shapes, XP/levels 1-45, 8 stats, 9 classes (to level 30), leaderboard, respawn, desktop+touch input, LAN URL display.
- **Verified (sandbox, Node 22.22):** `npx tsc --noEmit` clean; `npm run build` OK (12.5 KB bundle); `npm test` 18/18 pass (progression, protocol validation, sim rules, WS integration); real `npm start` served `/`, `/client.js`, `/api/info` via a non-loopback IP; sim soak: 24 firing players avg 0.26 ms/tick.
- **Not verified:** Any browser rendering/HUD, touch controls, iOS/Android, real hotspot reachability, Windows `.bat` scripts, balance/feel, behavior with the user's real repo.
- **Weak points / regressions:** No prediction (laggy self-movement possible); balance untuned; no bullet-vs-bullet; snapshots are uncompressed JSON; HUD on small phones (upgrade panel overlaps left stick zone while visible) needs real-device tuning.
- **Next 1–3 tasks:** (1) Apply patch, `npm install`, `npm start`, play on PC + one phone; report bugs. (2) Add client-side prediction for own tank and tune mobile HUD from real-device findings. (3) Level-45 classes and balance pass.

### Session 0 — planning baseline (2026-11-03)
- **Goal:** Capture the game vision, LAN-hosting requirement, AI handoff workflow and patch-only delivery rule.
- **Changed:** Created this planning baseline and the companion Claude project instructions / Windows patch runner.
- **Verified:** Planning requirements only; no game repository or code was available to inspect.
- **Not verified:** All implementation milestones, real hotspot reachability, browser/device compatibility and runtime performance.
- **Weak points:** Repository and current commit are unknown; hotspot client isolation may affect joining.
- **Next 1–3 tasks:** (1) Attach/link the GitHub repo and complete M0. (2) Record the actual stack and existing files. (3) Build the smallest browser arena prototype before expanding gameplay.

## 10. Rules for updating this file

- Update the status table, last-verified date, risks and session log in the same patch as code changes.
- Keep `DONE` tied to evidence: name the test or manual test and its result.
- Separate implemented, tested, and device-tested. A build passing does not prove mobile or LAN works.
- Record important architecture decisions here so the next AI does not reverse them.
- Keep next tasks to the most valuable 1–3 steps; do not turn this file into a giant design document.
- If the repository contradicts this document, inspect the code and reconcile this file rather than blindly trusting either one.
