# Diep-Style LAN Game — Master Completion Checklist

A long-form roadmap for finishing the browser-based multiplayer tank arena in `D:\Projects\Diep`.

**Project goal:** a polished Diep.io-inspired 2D tank arena that runs in a browser, can be hosted by one computer, and lets other computers and phones join through the same Wi-Fi network or phone hotspot.

**How to use this file**
- Work from top to bottom inside each phase. Do not try to build every tank and game mode at once.
- `[x]` means the feature was already present in the public `main` branch or was confirmed by the user during this conversation. It does **not** automatically mean the feature is fully balanced or manually tested.
- `[ ]` means it still needs implementation, verification, polish, or a deliberate design decision.
- `P0` = required for a reliable playable release; `P1` = important for a complete Diep-like game; `P2` = optional/advanced polish.
- Commit small working changes. Run typecheck and tests after each meaningful system change.
- Keep this checklist in the repository and update it whenever a task is completed.

---

# Current project snapshot

This snapshot is based on the public GitHub `main` branch inspected on 2026-11-03, plus the local test results provided by the developer in this conversation.

## Already present in the project

- [x] TypeScript + Node.js project structure; Node.js engine requirement is `>=22`.
- [x] `npm run build`, `npm run start`, `npm run start:only`, `npm run typecheck`, and `npm test` scripts.
- [x] HTTP server serves the game client and exposes `/api/info`.
- [x] WebSocket multiplayer endpoint at `/ws`.
- [x] Server listens on `0.0.0.0` so other devices on the LAN can connect.
- [x] Server simulation is configured for 30 ticks per second.
- [x] Arena boundary and player clamping.
- [x] Basic player joining, naming, spawning, movement, aiming, and firing.
- [x] Server-side input validation and clamping.
- [x] Bullets with speed, damage, health/penetration, lifetime, and owner ID.
- [x] Bullet collisions with players and shapes.
- [x] Player-to-player and player-to-shape body collisions.
- [x] Collision knockback separated from normal movement.
- [x] Square, triangle, and pentagon shape definitions and respawning.
- [x] Health, max health, regeneration delay, body damage, and spawn protection.
- [x] Eight upgradeable stats.
- [x] XP, level calculation, stat points, and class evolution validation.
- [x] Level cap of 45 and seven-point stat caps in the current configuration.
- [x] Twelve tank definitions currently present: Basic, Twin, Sniper, Machine Gun, Flank Guard, Triple Shot, Assassin, Gunner, Quad Tank, Penta Shot, Ranger, Streamliner, and Octo Tank.
- [x] Leaderboard data for the top ten living players.
- [x] Client-side snapshot buffering and interpolation for remote entities.
- [x] Client reconnect attempt after a WebSocket disconnection.
- [x] Keyboard/mouse controls and a unified touch-input implementation with two virtual sticks.
- [x] Canvas rendering, player names/health information, shapes, bullets, and tank barrels.
- [x] HUD elements for XP, stats, upgrade points, class choices, and level-up feedback.
- [x] LAN address helper displayed to players joining from the host's network.
- [x] The user successfully ran `npm ci`.
- [x] The user successfully ran `npm run typecheck` after installing dependencies.
- [x] The user's test run passed all 21 existing tests.
- [x] The user's client build completed successfully.

## Important items that are not finished yet

- [ ] The local recoil patch was applied successfully and passed typecheck plus the existing test suite, but recoil has not yet been given dedicated automated tests or fully tuned through gameplay.
- [ ] The recoil change is local. It must be reviewed, tested, committed, and pushed to GitHub before it becomes part of the public repository.
- [ ] The existing tests do not prove that the recoil feels like Diep.io; manual gameplay testing is still required.
- [ ] `npm run start` encountered `EADDRINUSE` on port `3000`. Identify the process already using that port or run the server on a different port. The build itself succeeded.
- [ ] The existing tank roster is a starter roster, not the full Diep.io class tree.
- [ ] The game needs a complete death/respawn flow, more classes and projectile types, additional game modes, robust mobile testing, and release-level polish.

---

# Phase 0 — Define what “finished” means

## Product scope and design decisions

- [ ] `P0` Decide whether the goal is a faithful Diep.io-style recreation or an original game inspired by Diep.io. Record which mechanics should match closely and which can be changed.
- [ ] `P0` Write a one-paragraph game vision and keep it in `README.md`.
- [ ] `P0` Define the first release target: local hotspot/LAN multiplayer on desktop and mobile browsers.
- [ ] `P0` Decide whether an internet-hosted public server is part of version 1 or a later milestone.
- [ ] `P0` Define the minimum supported browsers: Chrome/Edge desktop, Chrome Android, and Safari iOS if available for testing.
- [ ] `P0` Decide the expected number of simultaneous players for the first release. The current code has a configurable cap of 24; test what the host computer can actually handle.
- [ ] `P0` Decide whether the game is FFA-only for the first playable release, with teams and other modes added later.
- [ ] `P0` Decide whether players respawn at level 1 or retain a reduced level after death. Make the rule explicit; the current code resets a player to level 1.
- [ ] `P0` Decide whether a player's score is XP, a separate score, or both. Keep leaderboard score and progression XP conceptually clear.
- [ ] `P0` Decide whether a class choice is permanent for a life or can be changed at later milestones.
- [ ] `P0` Decide whether there will be bots when the server has few human players.
- [ ] `P0` Decide the target visual style: classic minimal Diep-like shapes, a more polished custom style, or a hybrid.
- [ ] `P0` Create a short “not in version 1” list so optional features do not delay the core game.
- [ ] `P1` Choose an original game title, logo, colour palette, and visual identity if the game will be shared publicly.
- [ ] `P1` Create a feature matrix showing which systems are server-authoritative, client-rendered, or shared configuration.
- [ ] `P1` Write down expected gameplay timings: server tick rate, snapshot rate, fire rates, projectile lifetimes, respawn delay, and regeneration delay.
- [ ] `P1` Define a balance target for an ordinary fight: approximate time-to-kill, time-to-level, and time for a new player to reach level 15/30/45.

## Reference and rules documentation

- [ ] `P0` Create `docs/GAME_DESIGN.md` describing the core game loop.
- [ ] `P0` Create `docs/MECHANICS.md` for movement, recoil, damage, collision, XP, levels, and stats.
- [ ] `P0` Create `docs/CLASSES.md` containing each class's parent, unlock level, barrels, ammunition, stats, and special ability.
- [ ] `P1` Create `docs/GAME_MODES.md` defining objectives, teams, maps, and win conditions.
- [ ] `P1` Record every borrowed or adapted reference value with its source and whether it is confirmed, approximate, or a game-specific adjustment.
- [ ] `P1` Avoid treating old community wiki numbers as guaranteed current-game values; test and tune values in your own game.

---

# Phase 1 — Make the project easy and safe to work on

## Repository and development workflow

- [ ] `P0` Keep the project on `main` and make sure `origin/main` is the intended default branch.
- [ ] `P0` Add a clear `README.md` with setup, start, test, and LAN instructions.
- [ ] `P0` Add a `.env.example` if environment variables are introduced. Never commit secrets.
- [ ] `P0` Add a `.gitignore` for `node_modules`, build output, logs, temporary files, and local environment files.
- [ ] `P0` Verify `package-lock.json` is committed and kept in sync with `package.json`.
- [ ] `P0` Document that `npm ci` is the clean dependency installation command.
- [ ] `P0` Document that `npm run start` builds the client and starts the server.
- [ ] `P0` Document that `npm run start:only` starts the server without rebuilding the client.
- [ ] `P0` Document that `npm run typecheck` runs TypeScript validation.
- [ ] `P0` Document that `npm test` runs the automated test suite.
- [ ] `P0` Add a single `check` script that runs typecheck, tests, and build in a predictable order.
- [ ] `P0` Use a separate branch for large or risky features.
- [ ] `P0` Commit after every known-good milestone.
- [ ] `P0` Review `git diff` before every commit.
- [ ] `P0` Do not overwrite local changes with a new patch without checking `git status` first.
- [ ] `P1` Add GitHub Actions CI to install dependencies, run typecheck, run tests, and build on every push/pull request.
- [ ] `P1` Add a basic issue template for bugs and feature requests.
- [ ] `P1` Add a pull request checklist for tests, mobile behaviour, balance, and screenshots.
- [ ] `P1` Add a changelog for visible game changes.
- [ ] `P1` Keep a short `PROJECT_CONTEXT.md` describing architecture and current priorities for future AI coding sessions.

## Startup and configuration

- [ ] `P0` Resolve the port `3000` conflict during local startup.
- [ ] `P0` Document how to identify the process listening on port 3000 using `netstat -ano | findstr :3000`.
- [ ] `P0` Document how to run on another port in Windows CMD, for example `set "PORT=3001" && npm run start`.
- [ ] `P0` Add a friendly server error when the chosen port is already occupied instead of an unhandled stack trace.
- [ ] `P0` Make the startup output show the local URL, LAN URLs, port, and player capacity.
- [ ] `P0` Verify the firewall helper script only adds the intended private-network rule.
- [ ] `P0` Add a stop-server instruction and ensure Ctrl+C closes the server cleanly.
- [ ] `P1` Support a configurable server name and room name.
- [ ] `P1` Support configuration for max players, arena size, tick rate, and selected game mode.
- [ ] `P1` Validate configuration values on server startup.

---

# Phase 2 — Finish the core playable loop

## Joining and spawning

- [ ] `P0` Test joining with a valid player name.
- [ ] `P0` Test blank, whitespace-only, very long, and unusual player names.
- [ ] `P0` Prevent two connections from accidentally controlling the same player unless reconnect recovery is intended.
- [ ] `P0` Show a clear “connecting”, “connected”, “failed”, and “reconnecting” status.
- [ ] `P0` Show a useful message when the room is full.
- [ ] `P0` Ensure a player receives exactly one player entity after joining.
- [ ] `P0` Ensure disconnecting removes the player's entity and related state.
- [ ] `P0` Choose and implement a safe spawn location.
- [ ] `P0` Ensure players do not spawn inside another player, a shape, a wall, or a forbidden zone.
- [ ] `P0` Add short spawn protection with a visible indication.
- [ ] `P0` Decide exactly which actions cancel spawn protection: movement, firing, collision, or elapsed time.
- [ ] `P0` Make spawn protection consistent on server and client.
- [ ] `P0` Reset all temporary state on respawn: velocity, firing, cooldowns, input, hit attribution, and special ability states.
- [ ] `P1` Add a short spawn animation or spawn effect.

## Main game loop

- [ ] `P0` Verify a player can move, aim, shoot, hit shapes, earn XP, level up, spend points, evolve, fight other players, die, and rejoin.
- [ ] `P0` Make the complete loop playable without opening developer tools.
- [ ] `P0` Ensure no level-up, death, respawn, or class transition leaves stale UI behind.
- [ ] `P0` Ensure the game continues correctly when one player disconnects during combat.
- [ ] `P0` Ensure the game continues correctly when the final player leaves.
- [ ] `P1` Add a short tutorial or first-join control hint.
- [ ] `P1` Add a practice option or safe way to learn controls without immediately fighting experienced players.

---

# Phase 3 — Movement and physics

## Normal movement

- [ ] `P0` Verify WASD movement works in all four directions.
- [ ] `P0` Verify arrow-key movement works if retained as a supported control.
- [ ] `P0` Normalize diagonal input so diagonal movement is not faster than straight movement.
- [ ] `P0` Verify movement is frame-rate independent.
- [ ] `P0` Verify the server, not the client, decides the authoritative player position.
- [ ] `P0` Verify the player cannot exceed the arena boundaries.
- [ ] `P0` Verify movement stops or behaves safely after a player dies.
- [ ] `P0` Verify changing direction does not create unexplained velocity spikes.
- [ ] `P1` Add configurable acceleration and deceleration rather than instant speed changes.
- [ ] `P1` Tune movement responsiveness separately for mouse/keyboard and touch devices.
- [ ] `P1` Ensure level-based movement scaling is deliberate and documented.

## Recoil — high-priority feature

- [x] Local recoil patch was applied to `src/server/game.ts`; local typecheck and the 21 existing tests passed afterward.
- [ ] `P0` Inspect the current local recoil diff and confirm exactly which fields and methods it changes.
- [ ] `P0` Add recoil-specific tests; the existing 21 tests did not explicitly prove recoil behaviour.
- [ ] `P0` Verify firing pushes the shooter opposite the projectile's actual travel direction.
- [ ] `P0` Verify a barrel firing to the left pushes the tank to the right.
- [ ] `P0` Verify a barrel firing to the right pushes the tank to the left.
- [ ] `P0` Verify upward and downward firing produce the correct recoil direction.
- [ ] `P0` Verify projectile spread uses the actual randomized shot angle for recoil direction.
- [ ] `P0` Verify multiple barrels apply separate recoil impulses.
- [ ] `P0` Verify opposing barrels cancel or partially cancel recoil naturally.
- [ ] `P0` Verify recoil does not accidentally modify collision knockback values.
- [ ] `P0` Verify recoil does not change projectile damage or projectile health.
- [ ] `P0` Verify holding fire creates repeated recoil impulses at the weapon's actual firing cadence.
- [ ] `P0` Verify releasing fire stops new recoil impulses while existing recoil momentum decays naturally.
- [ ] `P0` Verify recoil is applied once per projectile, not once per rendered frame.
- [ ] `P0` Tune recoil decay so the tank retains momentum without drifting forever.
- [ ] `P0` Tune recoil strength so a large cannon has a noticeable kick and a small cannon has a lighter kick.
- [ ] `P0` Decide whether recoil scales linearly with bullet radius, bullet area, projectile mass, or a manually tuned per-barrel value.
- [ ] `P0` Do not assume visual barrel width alone is always the ideal measure of recoil; support explicit recoil tuning per weapon.
- [ ] `P0` Test Basic, Machine Gun, Gunner, Destroyer-style, and Annihilator-style weapons separately.
- [ ] `P0` Test shooting backwards while moving forwards to see whether recoil can boost forward movement.
- [ ] `P0` Test shooting sideways while moving to create diagonal movement tricks.
- [ ] `P0` Ensure recoil respects arena walls and cannot launch players outside the arena.
- [ ] `P0` Decide whether recoil should be affected by player mass/size or remain a fixed impulse per barrel.
- [ ] `P0` Add a maximum velocity safeguard without making recoil feel artificially capped.
- [ ] `P1` Add subtle visual recoil animation to the barrel or tank body.
- [ ] `P1` Add an optional recoil trail or small muzzle effect.
- [ ] `P1` Compare recoil with keyboard movement, controller-like touch movement, and no movement input.
- [ ] `P0` Commit and push the recoil feature after manual testing and dedicated tests pass.

## Collision and knockback

- [ ] `P0` Test player-versus-player collision at different levels and sizes.
- [ ] `P0` Test player-versus-shape collision.
- [ ] `P0` Test bullet-versus-player collision.
- [ ] `P0` Test bullet-versus-shape collision.
- [ ] `P0` Test bullet-versus-bullet collision if this is part of the chosen ruleset.
- [ ] `P0` Prevent collision calculations from producing NaN or infinite values when two entities occupy almost identical coordinates.
- [ ] `P0` Verify collision separation does not push entities through arena walls.
- [ ] `P0` Verify spawn protection prevents the intended damage and collision effects.
- [ ] `P1` Add collision layers/masks so each entity type only interacts with valid entity types.
- [ ] `P1` Tune knockback independently from damage.
- [ ] `P1` Ensure a low-speed body collision and a high-speed body collision feel meaningfully different if speed-based impact is desired.
- [ ] `P1` Add tests for simultaneous collisions involving three or more entities.
- [ ] `P1` Add protection against repeated damage from one overlapping entity every tick if the intended mechanic requires a damage cooldown.

---

# Phase 4 — Weapons and projectiles

## Weapon architecture

- [ ] `P0` Keep weapon definitions data-driven in shared configuration.
- [ ] `P0` Support multiple barrels per tank.
- [ ] `P0` Support each barrel's angle, offset, length, width, and firing delay.
- [ ] `P0` Support per-barrel reload/cooldown state.
- [ ] `P0` Ensure weapon rendering uses the same barrel data that the server uses to spawn projectiles.
- [ ] `P0` Add explicit weapon fields for recoil, spread, projectile type, and any special behaviour rather than hardcoding class IDs in the firing method.
- [ ] `P0` Keep server authority over projectile creation and projectile ownership.
- [ ] `P1` Allow weapons to have different projectile definitions, not just different multipliers.
- [ ] `P1` Allow weapons to have firing patterns such as sequential, simultaneous, alternating, and burst.
- [ ] `P1` Allow weapons to have a special ability/cooldown when appropriate.

## Bullet behaviour

- [ ] `P0` Verify bullet direction and velocity match the barrel angle.
- [ ] `P0` Verify bullet spawn position is outside the tank body and near the barrel muzzle.
- [ ] `P0` Verify bullets travel at a consistent speed independent of frame rate.
- [ ] `P0` Verify bullets expire after their configured lifetime.
- [ ] `P0` Verify bullets disappear when they leave the useful arena bounds.
- [ ] `P0` Verify bullet damage is applied once per valid collision.
- [ ] `P0` Verify bullet penetration/health is reduced by the correct collision cost.
- [ ] `P0` Verify a bullet cannot damage its owner.
- [ ] `P0` Verify a bullet cannot repeatedly damage the same player in consecutive ticks unless piercing-through damage is intentionally supported.
- [ ] `P0` Verify bullet ownership remains valid if the owner disconnects or dies.
- [ ] `P0` Preserve owner attribution for kills, assists, and kill-feed messages.
- [ ] `P0` Ensure the bullet limit is enforced safely when many players fire at once.
- [ ] `P1` Add bullet trails and muzzle flashes as client-only visual effects.
- [ ] `P1` Add separate impact effects for tanks, shapes, traps, and walls.
- [ ] `P1` Add projectile interpolation or client-side rendering prediction to make remote bullets look smooth.
- [ ] `P1` Test high-speed bullets so they cannot tunnel through thin targets between server ticks.
- [ ] `P1` Use swept collision or substeps if high-speed projectile tunnelling becomes measurable.
- [ ] `P1` Add projectile-versus-projectile interactions if needed for more authentic combat.
- [ ] `P2` Add critical visual variants, unusual projectile trails, or cosmetic skins.

## Firing controls

- [ ] `P0` Verify mouse hold fires continuously.
- [ ] `P0` Verify touch aim/fire works without accidental page scrolling.
- [ ] `P0` Verify firing stops when the player releases the fire control.
- [ ] `P0` Verify input is reset when the browser loses focus.
- [ ] `P0` Verify input is reset when a player dies or disconnects.
- [ ] `P1` Add Auto Fire toggle.
- [ ] `P1` Add an Auto Fire key binding and a mobile button.
- [ ] `P1` Show whether Auto Fire is enabled.
- [ ] `P1` Make Auto Fire obey reload and projectile limits exactly like manual firing.
- [ ] `P1` Add a settings option to change the Auto Fire key.

---

# Phase 5 — Stats, XP, and progression

## Eight upgrade stats

- [x] Eight stat keys and labels currently exist: Health Regen, Max Health, Body Damage, Bullet Speed, Bullet Penetration, Bullet Damage, Reload, and Movement Speed.
- [ ] `P0` Validate every stat formula against the intended game design.
- [ ] `P0` Document the base value and per-point effect of every stat.
- [ ] `P0` Show the current stat value or a useful description in the upgrade UI.
- [ ] `P0` Show the maximum upgrade level for each stat.
- [ ] `P0` Prevent spending points when no upgrade points are available.
- [ ] `P0` Prevent spending beyond the stat cap.
- [ ] `P0` Ensure stat upgrades are authoritative and validated by the server.
- [ ] `P0` Ensure all clients see the correct updated tank stats and appearance.
- [ ] `P0` Add tests for every stat's minimum, maximum, and one-point increase.
- [ ] `P1` Add mouse hover/touch info for what each stat improves.
- [ ] `P1` Add keyboard shortcuts 1–8 and display the shortcuts.
- [ ] `P1` Add a setting for alternate stat hotkeys.
- [ ] `P1` Decide whether the game should offer a stat respec feature, and if so, when and at what cost.
- [ ] `P1` Add a build preset or stat allocation guide if the game becomes class-heavy.

## Health and damage

- [ ] `P0` Test health never exceeds max health after healing.
- [ ] `P0` Test max-health upgrades preserve the intended current-health ratio.
- [ ] `P0` Test regeneration starts only after the intended no-damage delay.
- [ ] `P0` Test regeneration stops at max health.
- [ ] `P0` Test body damage against players and shapes separately.
- [ ] `P0` Test bullet damage against players and shapes separately.
- [ ] `P0` Display health bars clearly for self and visible opponents.
- [ ] `P1` Add damage numbers or impact feedback if it improves readability.
- [ ] `P1` Add low-health warning without making the screen distracting.

## XP and levels

- [x] XP thresholds, level calculation, level cap, and point earning are already implemented and covered by tests.
- [ ] `P0` Decide the exact XP rewards for every shape and every enemy kill.
- [ ] `P0` Decide whether damage contribution grants assist XP.
- [ ] `P0` Decide whether XP is awarded to a player who disconnects immediately after a kill.
- [ ] `P0` Verify XP cannot be granted twice for the same destroyed entity.
- [ ] `P0` Verify level never exceeds the configured maximum.
- [ ] `P0` Verify stat points earned always match the progression rules.
- [ ] `P0` Verify a level-up updates derived stats without breaking health, movement, or weapon cooldowns.
- [ ] `P0` Show current XP, XP needed for next level, and level number.
- [ ] `P0` Make level-up feedback clear but not disruptive during combat.
- [ ] `P1` Add a clear max-level state when level 45 is reached.
- [ ] `P1` Add a progression test for receiving enough XP to gain multiple levels in a single update.
- [ ] `P1` Decide and implement the death/respawn level rule.
- [ ] `P1` Decide whether score resets on death, persists for a session, or is separate from XP.
- [ ] `P1` Add a small post-match or session summary of XP gained.

---

# Phase 6 — Expand the tank roster and class evolution

## Class-system foundation

- [x] Current class configuration supports a class ID, name, parent, unlock level, barrels, reload multiplier, damage multiplier, and bullet-speed multiplier.
- [ ] `P0` Add a class definition validator: unique IDs, valid parent IDs, no circular parent links, valid unlock levels, and valid weapon definitions.
- [ ] `P0` Keep the class tree data-driven; avoid one-off class-specific branches throughout unrelated systems.
- [ ] `P0` Add a class selection panel showing only classes currently available to the player.
- [ ] `P0` Show the class name and a clear preview of its weapon layout.
- [ ] `P0` Explain the core strength and weakness of each class.
- [ ] `P0` Ensure class evolution is validated server-side.
- [ ] `P0` Ensure class evolution resets or preserves cooldowns intentionally.
- [ ] `P0` Ensure switching class cannot create duplicate bullets, drones, or stale weapons.
- [ ] `P1` Add a visual class tree with parent/child branches.
- [ ] `P1` Add a class-preview sandbox or dummy display.
- [ ] `P1` Add automated tests for every class unlock path.
- [ ] `P1` Add a balance sheet comparing all class stats and weapon output.

## Existing twelve classes — polish and balance

- [ ] `P0` Basic Tank: validate baseline damage, reload, speed, size, and beginner experience.
- [ ] `P0` Twin: validate alternating/parallel barrels and per-barrel firing cadence.
- [ ] `P0` Sniper: validate longer range, slower fire rate, and accurate shots.
- [ ] `P0` Machine Gun: validate high fire rate and spread.
- [ ] `P0` Flank Guard: validate front/rear weapons and recoil cancellation.
- [ ] `P0` Triple Shot: validate three-barrel firing angles and coverage.
- [ ] `P0` Assassin: improve long-range identity and distinguish it from Sniper.
- [ ] `P0` Gunner: validate four small barrels and its low per-projectile damage.
- [ ] `P0` Quad Tank: validate four-direction firing and interaction with Auto Spin.
- [ ] `P0` Penta Shot: validate five-barrel spread and close-range coverage.
- [ ] `P0` Ranger: validate long-range visibility and accurate projectile behaviour.
- [ ] `P0` Streamliner: validate its five narrow barrels and continuous firing pattern.
- [ ] `P0` Octo Tank: validate eight-barrel coverage and recoil from all barrels.
- [ ] `P1` Make sure each class has a distinct identity rather than being only a numerical upgrade.
- [ ] `P1` Test each class against the same dummy targets and record damage per second, burst damage, and practical range.

## Expand the tier-2 and tier-3 tree

- [ ] `P1` Add Twin Flank.
- [ ] `P1` Add Triplet.
- [ ] `P1` Add Spread Shot.
- [ ] `P1` Add Hunter.
- [ ] `P1` Add Predator.
- [ ] `P1` Add Stalker.
- [ ] `P1` Add Sprayer.
- [ ] `P1` Add Destroyer.
- [ ] `P1` Add Hybrid.
- [ ] `P1` Add Annihilator.
- [ ] `P1` Add Tri-Angle.
- [ ] `P1` Add Booster.
- [ ] `P1` Add Fighter.
- [ ] `P1` Add Auto 3.
- [ ] `P1` Add Auto 5.
- [ ] `P1` Add Trapper.
- [ ] `P1` Add Tri-Trapper.
- [ ] `P1` Add Mega Trapper.
- [ ] `P1` Add Auto Trapper.
- [ ] `P1` Add Overseer.
- [ ] `P1` Add Overlord.
- [ ] `P1` Add Manager.
- [ ] `P1` Add Necromancer.
- [ ] `P1` Add Battleship.
- [ ] `P1` Add Factory.
- [ ] `P1` Add Smasher branch at its intended unlock level.
- [ ] `P1` Add Spike.
- [ ] `P1` Add Landmine.
- [ ] `P1` Add Auto Smasher.
- [ ] `P1` Verify every branch has valid unlock requirements and a reachable parent.
- [ ] `P1` Verify the class tree does not offer a class before its intended level.
- [ ] `P1` Review the full tree against your chosen reference before calling the roster complete.

## Special class weapon systems

- [ ] `P1` Design a general drone entity with owner, health, damage, speed, target, and lifetime/state.
- [ ] `P1` Implement drone spawning limits per player/class.
- [ ] `P1` Implement drone target selection.
- [ ] `P1` Implement drone movement toward targets.
- [ ] `P1` Implement drone return/orbit behaviour.
- [ ] `P1` Implement player drone commands: attack, defend, repel, or their chosen equivalents.
- [ ] `P1` Implement drone death and respawn/replacement rules.
- [ ] `P1` Implement Necromancer conversion of eligible destroyed shapes into drones if desired.
- [ ] `P1` Implement Factory minion spawning and minion control.
- [ ] `P1` Implement trap entities with deployment, collision, damage, and lifetime rules.
- [ ] `P1` Implement trap placement patterns for Trapper classes.
- [ ] `P1` Implement missiles with their own acceleration/steering rules if included.
- [ ] `P1` Implement Auto Turret entities and target selection for Auto Gunner/Auto 3/Auto 5/Auto Trapper.
- [ ] `P1` Implement rammer class body stats and collision-focused balance.
- [ ] `P1` Add invisibility for Stalker, Manager, and Landmine if matching those classes.
- [ ] `P1` Add class-specific special ability tests.

---

# Phase 7 — World, shapes, NPCs, and AI

## Arena

- [x] A square arena with a configurable size and boundary clamping exists.
- [ ] `P0` Add visible arena edges and clear boundary feedback.
- [ ] `P0` Ensure the camera never renders outside the intended world in a confusing way.
- [ ] `P1` Add optional obstacles or walls if required by a Maze-like mode.
- [ ] `P1` Add map configuration so different modes can use different arena layouts.
- [ ] `P1` Add spawn points and safe zones for team modes.
- [ ] `P1` Add a minimap showing player and team positions if appropriate.

## Shapes

- [x] Square, triangle, and pentagon shapes exist with health, XP, radius, damage, and spawn weights.
- [ ] `P0` Verify shape health, damage, XP, size, and colour are balanced.
- [ ] `P0` Ensure shape spawning never creates shapes outside the arena or inside inaccessible geometry.
- [ ] `P0` Ensure destroyed shapes are removed exactly once.
- [ ] `P0` Ensure XP attribution goes to the correct last hitter or use a damage-contribution system.
- [ ] `P1` Add alpha shapes if desired.
- [ ] `P1` Add beta shapes if desired.
- [ ] `P1` Add crashers.
- [ ] `P1` Add stronger polygon variants for higher-risk areas.
- [ ] `P1` Add shape spawn pacing and density controls.
- [ ] `P1` Add shape collision and knockback tuning.
- [ ] `P1` Add visual damage feedback to shapes.
- [ ] `P1` Add shape spawn/despawn effects.

## NPC and bot behaviour

- [ ] `P1` Decide whether crashers are part of the first full release.
- [ ] `P1` Implement crasher movement toward eligible targets.
- [ ] `P1` Implement crasher collision damage and death behaviour.
- [ ] `P1` Implement rules for whether crashers detect invisible tanks.
- [ ] `P2` Add simple practice bots that move and aim.
- [ ] `P2` Add bot difficulty levels.
- [ ] `P2` Add bot target selection and retreat behaviour.
- [ ] `P2` Ensure bots cannot read hidden client information or bypass normal server rules.
- [ ] `P2` Add bot population scaling when the room is empty, if desired.

---

# Phase 8 — Multiplayer networking and server reliability

## Server authority and protocol

- [x] The server simulates player movement, firing, bullets, collisions, health, XP, and class/stat validation.
- [x] The WebSocket protocol accepts join, input, upgrade, and class-selection messages.
- [x] The server validates message size and rate-limits messages.
- [ ] `P0` Keep client messages as intents only; never accept client-supplied damage, XP, kills, or final positions.
- [ ] `P0` Validate every message field and reject malformed or unknown message types.
- [ ] `P0` Clamp movement and aim values on the server.
- [ ] `P0` Add server-side cooldown enforcement for every weapon.
- [ ] `P0` Add server-side validation for every special ability.
- [ ] `P0` Validate ownership before allowing drone, trap, or minion commands.
- [ ] `P0` Avoid trusting client timestamps for damage, cooldowns, or hit validation.
- [ ] `P0` Add a clear protocol version so future clients can be rejected or negotiated safely.
- [ ] `P1` Add structured error codes instead of relying only on error strings.
- [ ] `P1` Add basic server logs for join, leave, disconnect, invalid messages, and fatal errors.
- [ ] `P1` Avoid logging unnecessary personal information.

## Timing, snapshots, and interpolation

- [x] The simulation is configured at 30 Hz.
- [x] The server sends snapshots and the client buffers/interpolates them.
- [ ] `P0` Verify the server loop uses a stable fixed timestep or accumulator.
- [ ] `P0` Ensure a slow server frame does not permanently slow or accelerate the simulation.
- [ ] `P0` Decide snapshot send frequency independently of simulation tick rate.
- [ ] `P0` Test interpolation under normal Wi-Fi latency.
- [ ] `P0` Test interpolation with jitter and occasional packet delays.
- [ ] `P0` Test a client joining while many entities already exist.
- [ ] `P0` Test that entities disappear from the client when removed by the server.
- [ ] `P1` Add bounded extrapolation for short gaps if it improves responsiveness.
- [ ] `P1` Add a visible network-latency indicator.
- [ ] `P1` Add a visible connection-quality warning.
- [ ] `P1` Consider client-side prediction for the local player while keeping the server authoritative.
- [ ] `P1` Reconcile predicted local movement when the authoritative snapshot arrives.
- [ ] `P1` Ensure recoil prediction is visually smooth and does not double-apply recoil.

## Disconnects and reconnects

- [x] The client currently attempts to reconnect after WebSocket closure.
- [ ] `P0` Test Wi-Fi briefly disconnecting and reconnecting.
- [ ] `P0` Test the host laptop sleeping or changing networks.
- [ ] `P0` Prevent reconnect loops from creating multiple server-side players.
- [ ] `P0` Decide whether reconnecting restores the previous player or creates a new life.
- [ ] `P0` Show a clear “reconnecting” overlay and disable invalid controls.
- [ ] `P0` Stop sending input when disconnected.
- [ ] `P1` Add reconnect backoff rather than retrying forever at a constant interval.
- [ ] `P1` Add a connection timeout and a useful failure message.
- [ ] `P1` Handle server shutdown cleanly and tell clients the room is closed.

## Capacity and performance

- [ ] `P0` Test 2 simultaneous players.
- [ ] `P0` Test 4 simultaneous players.
- [ ] `P0` Test 8 simultaneous players.
- [ ] `P0` Test the configured maximum player count.
- [ ] `P0` Test maximum simultaneous firing and projectile counts.
- [ ] `P0` Test a crowded screen with many shapes and bullets.
- [ ] `P1` Measure CPU usage, memory usage, server tick duration, and snapshot size.
- [ ] `P1` Profile spatial-grid collision performance at maximum player count.
- [ ] `P1` Add a server performance warning if tick time exceeds the tick budget.
- [ ] `P1` Ensure disconnected players, expired bullets, and dead entities are fully cleaned up.
- [ ] `P1` Check for memory leaks during a long-running session.

---

# Phase 9 — LAN and phone-hotspot experience

- [x] The server binds to `0.0.0.0` and reports LAN addresses.
- [x] The client displays joining URLs returned by `/api/info`.
- [x] A Windows firewall helper script exists in the repository.
- [ ] `P0` Test hosting from the laptop while connected to the phone hotspot.
- [ ] `P0` Test joining from the phone that provides the hotspot, where the phone OS permits it.
- [ ] `P0` Test joining from a second phone on the same hotspot.
- [ ] `P0` Test joining from another laptop on the same Wi-Fi.
- [ ] `P0` Verify all devices use the same LAN subnet and can reach the host IP.
- [ ] `P0` Verify the Windows firewall allows Node.js on Private networks only when appropriate.
- [ ] `P0` Add a troubleshooting section for Windows firewall prompts.
- [ ] `P0` Add a troubleshooting section for hotspot client isolation/AP isolation.
- [ ] `P0` Explain that VPN software can alter local routing or block LAN communication.
- [ ] `P0` Show the correct URL to share, not `localhost`, on other devices.
- [ ] `P0` Make the LAN URL easy to copy with one tap/click.
- [ ] `P0` Add a QR code for the host URL so phones can join without typing an IP.
- [ ] `P1` Detect when the host's local IP changes and refresh the displayed connection details.
- [ ] `P1` Show how many players are currently connected.
- [ ] `P1` Add a room code only if a discovery/join mechanism is implemented; do not display a fake code.
- [ ] `P1` Test with mobile data disabled and Wi-Fi/hotspot enabled so the test is truly local.
- [ ] `P1` Test a long session to ensure hotspot power-saving does not silently break the connection.

---

# Phase 10 — Desktop and mobile controls

## Desktop

- [x] Keyboard movement and mouse aiming are present.
- [ ] `P0` Test WASD and arrow keys.
- [ ] `P0` Test mouse aiming when the cursor is near and far from the tank.
- [ ] `P0` Test holding and releasing left click.
- [ ] `P0` Test browser focus loss while moving or firing.
- [ ] `P0` Prevent browser context menus from interfering with gameplay.
- [ ] `P1` Add key binding settings.
- [ ] `P1` Add a pause/menu key where the game mode allows it.
- [ ] `P1` Add clear control hints on the join screen.

## Mobile

- [x] A unified touch-input class and dual virtual-stick structure are present.
- [ ] `P0` Test on a real Android phone, not only desktop device emulation.
- [ ] `P0` Test on the smallest supported phone screen.
- [ ] `P0` Test portrait orientation.
- [ ] `P0` Test landscape orientation.
- [ ] `P0` Decide whether portrait is supported, discouraged, or automatically prompts landscape.
- [ ] `P0` Ensure the left stick controls movement consistently.
- [ ] `P0` Ensure the right stick controls aim and firing consistently.
- [ ] `P0` Ensure two fingers can control movement and aim at the same time.
- [ ] `P0` Ensure touch pointer cancellation does not leave the player moving or firing.
- [ ] `P0` Ensure browser gestures, pull-to-refresh, pinch zoom, and page scrolling do not interrupt play.
- [ ] `P0` Respect safe-area insets on phones with notches and rounded corners.
- [ ] `P0` Make all buttons large enough for thumbs.
- [ ] `P0` Avoid putting essential buttons under browser UI or phone navigation areas.
- [ ] `P1` Add a mobile Auto Fire button.
- [ ] `P1` Add mobile buttons for Auto Spin and special abilities.
- [ ] `P1` Allow the user to reposition or resize virtual sticks.
- [ ] `P1` Add sensitivity settings for both sticks.
- [ ] `P1` Add haptic feedback only if it is supported and can be disabled.
- [ ] `P1` Test mobile battery use and device heating during a long session.

---

# Phase 11 — HUD, menus, and user experience

## In-game HUD

- [x] XP bar, stat upgrade UI, class choices, level-up toast, and leaderboard foundations exist.
- [ ] `P0` Make the player's level easy to identify.
- [ ] `P0` Make the player's current score easy to identify.
- [ ] `P0` Make the player's health and maximum health easy to identify.
- [ ] `P0` Make remaining skill points obvious.
- [ ] `P0` Make maxed stats visually distinct from upgradeable stats.
- [ ] `P0` Show a clear indication when no stat points remain.
- [ ] `P0` Show class name and class icon.
- [ ] `P0` Show Auto Fire and Auto Spin enabled/disabled states.
- [ ] `P0` Ensure UI stays readable on both desktop and mobile.
- [ ] `P0` Ensure UI does not block aiming or important battlefield information.
- [ ] `P1` Add small explanations for stats, class choices, and status effects.
- [ ] `P1` Add a minimap or radar if it provides meaningful information.
- [ ] `P1` Add kill-feed messages.
- [ ] `P1` Add assist notifications.
- [ ] `P1` Add notifications for class evolution and important game events.

## Main menu and lobby

- [ ] `P0` Add a proper title/menu screen.
- [ ] `P0` Add a player-name field with validation and a visible character limit.
- [ ] `P0` Add a Play/Join button with loading and failure states.
- [ ] `P0` Show room connection status before the player enters.
- [ ] `P0` Add a simple instructions/control panel.
- [ ] `P1` Add a lobby screen showing room name, connected players, and game mode.
- [ ] `P1` Add a room owner/host indicator.
- [ ] `P1` Add a ready-up state if the game later uses round-based matches.
- [ ] `P1` Add a settings menu.
- [ ] `P1` Add a credits/about screen.

## Death and respawn screen

- [ ] `P0` Replace the basic death text with a proper death screen.
- [ ] `P0` Display final score.
- [ ] `P0` Display final level.
- [ ] `P0` Display final tank class.
- [ ] `P0` Display killer name or a useful non-player source label.
- [ ] `P0` Display survival time for the current life.
- [ ] `P0` Add a respawn button.
- [ ] `P0` Disable normal gameplay controls while dead.
- [ ] `P0` Ensure the server controls when the player may respawn.
- [ ] `P1` Add kill count, assists, and best streak if those statistics are implemented.
- [ ] `P1` Add spectate-killer behaviour.
- [ ] `P1` Add spectate-next-player behaviour.
- [ ] `P1` Add spectator controls and a clear exit/respawn option.
- [ ] `P1` Preserve projectile ownership for kill attribution even when the shooter has died or disconnected.

## Leaderboard

- [x] A top-ten living-player leaderboard is present.
- [ ] `P0` Verify ordering updates correctly as scores change.
- [ ] `P0` Verify ties have stable and understandable ordering.
- [ ] `P0` Show player name, score, level, and optionally class.
- [ ] `P0` Highlight the local player when they are on the leaderboard.
- [ ] `P1` Decide whether dead players remain on the board for a short time.
- [ ] `P1` Add a leader arrow or minimap indicator only if visibility rules are clear.
- [ ] `P1` Keep leaderboard layout usable on narrow mobile screens.

---

# Phase 12 — Special mechanics

## Auto Spin

- [ ] `P1` Add an Auto Spin state that can be toggled on/off.
- [ ] `P1` Rotate weapon aim at a defined angular speed while enabled.
- [ ] `P1` Keep tank movement direction independent from weapon rotation.
- [ ] `P1` Decide whether mouse movement temporarily overrides Auto Spin or whether the toggle must be disabled first.
- [ ] `P1` Ensure Auto Spin works with single-barrel, multi-barrel, drone, and trapper classes where appropriate.
- [ ] `P1` Add a desktop key binding, defaulting to a convenient key such as C if desired.
- [ ] `P1` Add a mobile Auto Spin toggle.
- [ ] `P1` Show a visible enabled state.
- [ ] `P1` Add tests for angle wrapping and constant angular speed.

## Invisibility

- [ ] `P1` Add a gradual invisibility value from fully visible to fully invisible.
- [ ] `P1` Add class-specific activation delay.
- [ ] `P1` Define which actions reveal the player: moving, shooting, damage, collision, or ability use.
- [ ] `P1` Define whether damage partially reveals or fully reveals the tank.
- [ ] `P1` Apply visibility consistently to tank body, barrels, name, and health bar.
- [ ] `P1` Keep invisible players damageable unless a separate rule says otherwise.
- [ ] `P1` Decide how bullets, shapes, crashers, auto turrets, and base entities interact with invisible players.
- [ ] `P1` Prevent client-side invisibility from hiding the player from the server's collision system.
- [ ] `P1` Add visual tests for fade-in and fade-out.
- [ ] `P1` Add automated tests for reveal conditions.

## Other special abilities

- [ ] `P1` Build a generic cooldown/ability framework before adding many one-off abilities.
- [ ] `P1` Add clear ability state to snapshots.
- [ ] `P1` Add clear cooldown feedback to the HUD.
- [ ] `P1` Make cooldowns server-authoritative.
- [ ] `P1` Add ability input for desktop and mobile.
- [ ] `P1` Add a safe default when a player changes class while an ability is active.
- [ ] `P2` Add additional class-specific mechanics only after the shared ability framework is stable.

---

# Phase 13 — Game modes and teams

## Free For All (FFA)

- [ ] `P0` Finish and balance FFA as the first complete game mode.
- [ ] `P0` Ensure every player is hostile to every other player.
- [ ] `P0` Ensure kill attribution, XP rewards, leaderboard, and respawns work.
- [ ] `P0` Add a match/session timer if needed.
- [ ] `P1` Add configurable arena and shape density for FFA.

## Team modes

- [ ] `P1` Add team identity and team assignment to player state.
- [ ] `P1` Add 2 Teams mode.
- [ ] `P1` Add 4 Teams mode.
- [ ] `P1` Ensure teammates cannot damage each other unless friendly fire is enabled.
- [ ] `P1` Add team spawn locations.
- [ ] `P1` Add team colours to tanks, bullets, and UI.
- [ ] `P1` Add team leaderboard or team score.
- [ ] `P1` Add base zones and team protection if the selected ruleset requires them.
- [ ] `P1` Decide whether a team can become unbalanced and how auto-balancing works.
- [ ] `P1` Test disconnects and reconnects without leaving ghost team members.

## Other modes

- [ ] `P2` Add Maze mode with walls and procedural or configured layouts.
- [ ] `P2` Add Tag mode with a clear team/tag objective.
- [ ] `P2` Add Domination mode with capturable objectives.
- [ ] `P2` Add Sandbox mode with private/friendly settings and optional cheats for the host.
- [ ] `P2` Add Survival mode only if you want a wave-based PvE experience.
- [ ] `P2` Add custom mode settings for arena size, shape count, player limit, and respawn rules.
- [ ] `P2` Build a mode-selection UI.
- [ ] `P2` Add automated tests for every mode's win conditions and team rules.

---

# Phase 14 — Visuals, animation, and audio

## Visual polish

- [ ] `P0` Make all tank bodies and barrels visually consistent with their gameplay collision sizes.
- [ ] `P0` Make the self tank clearly distinguishable from opponents.
- [ ] `P0` Make team colours distinguishable without relying only on subtle shades.
- [ ] `P0` Keep text readable against the arena background.
- [ ] `P1` Add smooth tank movement animation.
- [ ] `P1` Add smooth barrel rotation.
- [ ] `P1` Add muzzle flashes.
- [ ] `P1` Add bullet trails.
- [ ] `P1` Add projectile impact particles.
- [ ] `P1` Add tank hit flashes.
- [ ] `P1` Add shape destruction particles.
- [ ] `P1` Add death/explosion animation.
- [ ] `P1` Add level-up and class-evolution effects.
- [ ] `P1` Add subtle screen shake for powerful hits, with a setting to disable it.
- [ ] `P1` Add a visual recoil kick that matches server-side recoil without changing actual physics.
- [ ] `P1` Add an optional reduced-effects setting for low-end phones.
- [ ] `P2` Add skins or cosmetic colour variants.
- [ ] `P2` Add cosmetic effects that do not change hitboxes or gameplay stats.

## Audio

- [ ] `P1` Add a basic sound system with a global volume setting.
- [ ] `P1` Add shooting sound.
- [ ] `P1` Add hit sound.
- [ ] `P1` Add shape destruction sound.
- [ ] `P1` Add tank destruction sound.
- [ ] `P1` Add level-up sound.
- [ ] `P1` Add class-evolution sound.
- [ ] `P1` Avoid playing a separate loud sound for every bullet in a rapid-fire weapon.
- [ ] `P1` Add mute controls and remember the user's preference locally.
- [ ] `P2` Add positional audio if it helps locate nearby combat.

---

# Phase 15 — Settings, accessibility, and quality of life

- [ ] `P1` Add master volume setting.
- [ ] `P1` Add sound effects volume setting.
- [ ] `P1` Add music volume setting if music exists.
- [ ] `P1` Add graphics/effects quality setting.
- [ ] `P1` Add screen shake toggle.
- [ ] `P1` Add mobile joystick sensitivity settings.
- [ ] `P1` Add control key rebinding.
- [ ] `P1` Add a toggle for showing player names.
- [ ] `P1` Add a toggle for showing health bars.
- [ ] `P1` Add a toggle for showing damage numbers if implemented.
- [ ] `P1` Add a high-contrast team/player colour option.
- [ ] `P1` Ensure important information is not communicated by colour alone.
- [ ] `P1` Make buttons and UI controls keyboard accessible.
- [ ] `P1` Add clear focus indicators for menu controls.
- [ ] `P1` Keep text and buttons usable at common browser zoom settings.
- [ ] `P2` Add multiple language support if the project needs it.
- [ ] `P2` Add left-handed mobile control layout.

---

# Phase 16 — Testing and bug prevention

## Automated tests

- [x] Existing tests cover class-tree consistency, class unlocking, movement clamping, arena bounds, firing/reload/bullet expiry, shape kills/XP, stat upgrades, class evolution, PvP bullets, spawn protection, snapshots, room cap/shape respawn, XP thresholds, stat progression, protocol validation, and LAN server join/snapshot/input/disconnect.
- [ ] `P0` Add recoil direction tests.
- [ ] `P0` Add recoil strength/size-scaling tests.
- [ ] `P0` Add recoil decay tests.
- [ ] `P0` Add recoil-plus-normal-movement tests.
- [ ] `P0` Add recoil cancellation tests for opposing barrels.
- [ ] `P0` Add tests for every new projectile type.
- [ ] `P0` Add tests for drone ownership and commands.
- [ ] `P0` Add tests for traps and their collision rules.
- [ ] `P0` Add tests for Auto Fire and Auto Spin.
- [ ] `P0` Add tests for invisibility activation and reveal rules.
- [ ] `P0` Add tests for death attribution and assists.
- [ ] `P0` Add tests for respawn state reset.
- [ ] `P0` Add tests for invalid special ability commands.
- [ ] `P1` Add deterministic physics tests using a seeded random number generator.
- [ ] `P1` Add snapshot/protocol compatibility tests.
- [ ] `P1` Add performance tests for high entity counts.
- [ ] `P1` Add a test that verifies server shutdown closes HTTP and WebSocket resources.

## Manual test matrix

- [ ] `P0` Test desktop Chrome.
- [ ] `P0` Test desktop Edge.
- [ ] `P0` Test Android Chrome.
- [ ] `P1` Test iOS Safari if you want to support iPhone/iPad.
- [ ] `P0` Test host on laptop + one phone.
- [ ] `P0` Test host on laptop + two phones.
- [ ] `P0` Test multiple laptops and phones together.
- [ ] `P0` Test a player joining during combat.
- [ ] `P0` Test a player leaving during combat.
- [ ] `P0` Test a player dying while firing.
- [ ] `P0` Test a player respawning while another player is nearby.
- [ ] `P0` Test a player changing class while firing.
- [ ] `P0` Test all eight stats at zero and at maximum.
- [ ] `P0` Test all current classes at level 45.
- [ ] `P0` Test the largest projectile count the game allows.
- [ ] `P1` Test a 30-minute session.
- [ ] `P1` Test a 2-hour session for leaks or performance degradation.
- [ ] `P1` Test unstable Wi-Fi and high latency.
- [ ] `P1` Test server restart while clients are connected.
- [ ] `P1` Test laptop sleep/wake and hotspot reconnect.

## Balance testing

- [ ] `P0` Build a simple training target/dummy for repeatable weapon tests.
- [ ] `P0` Record damage per second for each tank class.
- [ ] `P0` Record burst damage for each tank class.
- [ ] `P0` Record projectile lifetime and practical range for each class.
- [ ] `P0` Record movement speed for each class and level.
- [ ] `P0` Record recoil impulse and sustained recoil speed for every weapon.
- [ ] `P0` Compare recoil from small, medium, and large projectiles.
- [ ] `P0` Check for dominant builds that have no meaningful counter.
- [ ] `P0` Check whether any class is clearly weaker in every situation.
- [ ] `P1` Test duels between different classes using standardized stats.
- [ ] `P1` Test multi-player fights rather than balancing only around 1v1.
- [ ] `P1` Keep balance changes in a versioned spreadsheet or markdown table.

---

# Phase 17 — Performance and technical quality

- [ ] `P0` Ensure the game stays playable on the host laptop while several phones are connected.
- [ ] `P0` Measure client FPS on a mid-range Android phone.
- [ ] `P0` Reduce unnecessary allocations in the main render loop if profiling finds them.
- [ ] `P0` Ensure expired bullets and removed entities are cleaned up promptly.
- [ ] `P0` Ensure snapshot sizes remain bounded.
- [ ] `P1` Add an optional debug overlay showing FPS, ping, server tick time, entity counts, and snapshot size.
- [ ] `P1` Profile canvas rendering with many bullets and shapes.
- [ ] `P1` Avoid drawing entities outside the camera view.
- [ ] `P1` Use entity pooling only if allocation/GC profiling shows it is needed.
- [ ] `P1` Keep mobile visual effects scalable.
- [ ] `P1` Check CPU use while Auto Fire is enabled for many players.
- [ ] `P1` Check collision-grid cell size against actual entity sizes and densities.
- [ ] `P1` Ensure the server tick does not drift over long sessions.
- [ ] `P1` Set practical caps for players, bullets, drones, traps, and turrets.
- [ ] `P1` Add graceful behaviour when any entity cap is reached.

---

# Phase 18 — Security and abuse resistance

- [ ] `P0` Keep all damage, XP, cooldowns, class choices, and positions authoritative on the server.
- [ ] `P0` Reject malformed, oversized, or unknown client messages.
- [ ] `P0` Rate-limit input messages and disconnect abusive clients safely.
- [ ] `P0` Ensure clients cannot choose another player's ID as projectile owner.
- [ ] `P0` Ensure clients cannot create projectiles directly.
- [ ] `P0` Ensure clients cannot set their own health, XP, level, or stats.
- [ ] `P0` Ensure clients cannot fire faster than the server cooldown.
- [ ] `P0` Ensure class selection cannot bypass level/parent requirements.
- [ ] `P1` Validate names before displaying them in DOM elements.
- [ ] `P1` Use safe text rendering instead of inserting player-provided HTML.
- [ ] `P1` Add maximum connection and message-rate policies.
- [ ] `P1` Add a server-side room password option if needed for shared networks.
- [ ] `P1` Avoid exposing local filesystem paths or unnecessary server details to clients.
- [ ] `P1` Keep dependencies updated and review audit warnings.
- [ ] `P1` Define an appropriate license and attribution policy for assets and code.

---

# Phase 19 — Release and distribution

## Local LAN release

- [ ] `P0` Make a clean clone of the repository into a new folder.
- [ ] `P0` Run `npm ci` from that clean clone.
- [ ] `P0` Run `npm run typecheck`.
- [ ] `P0` Run `npm test`.
- [ ] `P0` Run `npm run build`.
- [ ] `P0` Run `npm run start` using an available port.
- [ ] `P0` Open the game on the host computer.
- [ ] `P0` Join from a second device using the LAN URL.
- [ ] `P0` Join from a phone hotspot setup.
- [ ] `P0` Verify the firewall instructions from a clean Windows installation/profile.
- [ ] `P0` Add a `START_GAME.bat` that checks Node.js and installs dependencies only when needed.
- [ ] `P0` Add a `STOP_GAME.bat` only if the server is launched in a way that can be safely stopped by it; otherwise document Ctrl+C.
- [ ] `P0` Make the launcher print all URLs and troubleshooting tips.
- [ ] `P1` Package the project as a simple ZIP for friends to host.
- [ ] `P1` Include a README in the ZIP explaining host and join steps.
- [ ] `P1` Test the ZIP on a computer that does not have the development folder or global TypeScript tools.

## Optional internet-hosted release

- [ ] `P2` Choose a hosting provider that supports long-running Node.js/WebSocket servers.
- [ ] `P2` Add production environment configuration and a configurable port.
- [ ] `P2` Configure HTTPS/WSS.
- [ ] `P2` Configure a public domain if desired.
- [ ] `P2` Add server restart and crash recovery policy.
- [ ] `P2` Add basic operational logs and monitoring.
- [ ] `P2` Add protection against public-server abuse and excessive traffic.
- [ ] `P2` Decide whether rooms are public, private, or invite-only.
- [ ] `P2` Test latency from different geographic regions before inviting players.

## Release checklist

- [ ] `P0` Decide the version number.
- [ ] `P0` Write release notes.
- [ ] `P0` Update README screenshots and feature list.
- [ ] `P0` Verify all links and setup instructions.
- [ ] `P0` Verify no secrets, local-only files, or debug-only settings are committed.
- [ ] `P0` Run the complete test/build checklist from a clean clone.
- [ ] `P0` Play one complete match from joining to death/respawn with at least two devices.
- [ ] `P0` Confirm no game-breaking console errors.
- [ ] `P0` Confirm no game-breaking server errors.
- [ ] `P0` Tag the release in Git.
- [ ] `P1` Ask a few people unfamiliar with the project to join and play without your help.
- [ ] `P1` Fix the biggest usability problems they encounter before calling the game finished.

---

# Phase 20 — Optional features after the core game is stable

- [ ] `P2` Add player account names or persistent profiles only if necessary; guest names are simpler for LAN play.
- [ ] `P2` Add saved statistics such as total kills, deaths, highest level, and longest survival.
- [ ] `P2` Add match history.
- [ ] `P2` Add private rooms.
- [ ] `P2` Add room browser/discovery for an internet-hosted version.
- [ ] `P2` Add spectator-only slots.
- [ ] `P2` Add custom maps.
- [ ] `P2` Add custom tank creator/configuration tools.
- [ ] `P2` Add custom shape creator/configuration tools.
- [ ] `P2` Add custom game rules.
- [ ] `P2` Add replay recording for debugging or sharing matches.
- [ ] `P2` Add an in-game chat only if moderation and abuse controls are considered.
- [ ] `P2` Add emotes or quick messages rather than unrestricted chat if appropriate.
- [ ] `P2` Add cosmetic unlocks that do not affect gameplay balance.
- [ ] `P2` Add achievements.
- [ ] `P2` Add training challenges for recoil movement, aiming, and class-specific skills.
- [ ] `P2` Add a sandbox mode for testing builds and weapon configurations.
- [ ] `P2` Add a balance/debug panel for the host in private rooms.
- [ ] `P2` Add a configurable bot practice mode.

---

# Recommended build order

Do not build the whole roadmap in one pass. This order gets you to a complete, fun game with the least wasted work.

## Milestone A — Stable playable prototype

- [ ] Resolve startup/port handling.
- [ ] Keep `npm run typecheck`, `npm test`, and `npm run build` passing.
- [ ] Verify two devices can join over the hotspot.
- [ ] Finish recoil and add recoil-specific tests.
- [ ] Fix obvious movement, collision, bullet, and death bugs.
- [ ] Finish the FFA play loop from join to death to respawn.

**Milestone A is complete when:** two or more devices can play a full FFA session without crashing, getting stuck, or desynchronizing badly.

## Milestone B — Combat feels good

- [ ] Tune all current weapons.
- [ ] Tune reload, damage, speed, penetration, and recoil.
- [ ] Add projectile impacts and damage feedback.
- [ ] Add a reliable class preview and evolution flow.
- [ ] Add a proper death screen and kill attribution.

**Milestone B is complete when:** the current twelve classes feel distinct and shooting/movement are satisfying.

## Milestone C — Complete progression and tank roster

- [ ] Verify the eight stats and level progression.
- [ ] Expand the class tree in coherent branches.
- [ ] Implement drone, trap, turret, missile, and rammer systems as reusable entity types.
- [ ] Add the special abilities required by those classes.
- [ ] Balance the expanded roster.

**Milestone C is complete when:** every class in the chosen release roster is unlockable, playable, and has a distinct role.

## Milestone D — Complete multiplayer experience

- [ ] Improve reconnect and network feedback.
- [ ] Add teams and team spawn logic.
- [ ] Add at least one additional game mode if desired.
- [ ] Test the configured maximum player count.
- [ ] Test long sessions and unstable Wi-Fi.

**Milestone D is complete when:** multiplayer remains reliable with the target number of players on a real hotspot/Wi-Fi network.

## Milestone E — Mobile and polish

- [ ] Test real phones in portrait and landscape.
- [ ] Finalize touch controls and mobile UI layout.
- [ ] Add sound, effects, settings, and accessibility options.
- [ ] Add tutorial/control help.
- [ ] Have new players test the game without assistance.

**Milestone E is complete when:** a new player can join from a phone, understand the controls, and play comfortably.

## Milestone F — Release

- [ ] Add documentation and launch scripts.
- [ ] Test a clean clone and clean install.
- [ ] Run all automated checks.
- [ ] Complete one end-to-end multiplayer session.
- [ ] Tag and publish a release.

**Milestone F is complete when:** someone other than the developer can download the project, start a room, and invite friends successfully.

---

# Definition of done — every feature

Before checking off any feature, confirm all of the following that apply:

- [ ] The feature works in a real match, not only in a unit test.
- [ ] The server validates all gameplay-critical outcomes.
- [ ] The client displays the correct state.
- [ ] Desktop controls work.
- [ ] Mobile controls work if the feature is available on mobile.
- [ ] The feature handles death, respawn, disconnect, and reconnect correctly.
- [ ] The feature respects arena boundaries and entity limits.
- [ ] The feature does not create unbounded memory or CPU usage.
- [ ] Automated tests cover important rules and edge cases.
- [ ] The feature is documented where future developers will look for it.
- [ ] Typecheck, tests, and build pass.
- [ ] The change is committed with a clear commit message.

---

# Useful commands for this project

Run these from `D:\Projects\Diep`:

```cmd
npm ci
npm run typecheck
npm test
npm run build
npm run start
```

Start the server on another port if port 3000 is occupied:

```cmd
set "PORT=3001" && npm run start
```

Check which process is using port 3000:

```cmd
netstat -ano | findstr :3000
```

Check the process name (replace `12345` with the PID shown above):

```cmd
tasklist /FI "PID eq 12345"
```

Check local changes before committing:

```cmd
git status
git diff
```

After a tested change:

```cmd
git add .
git commit -m "Describe the completed feature"
git push origin main
```

---

# Reference files in the repository

- `src/server/game.ts` — authoritative game simulation, players, bullets, shapes, movement, firing, collisions, XP, and snapshots.
- `src/server/server.ts` — HTTP/WebSocket server, message handling, room connections, and rate limiting.
- `src/server/net.ts` — LAN address discovery.
- `src/shared/config.ts` — arena settings, stat definitions, shape definitions, and tank class definitions.
- `src/shared/progression.ts` — XP thresholds, level calculation, stat points, class options, and derived stats.
- `src/shared/protocol.ts` — client/server message types, parsing, validation, and snapshot types.
- `src/client/main.ts` — connection, snapshots, interpolation, HUD, and client-side game flow.
- `src/client/input.ts` — keyboard, mouse, and touch input.
- `src/client/render.ts` — canvas rendering of tanks, bullets, shapes, and controls.
- `src/client/index.html` — page layout and styling.
- `tests/` — automated test suite.
- `scripts/build-client.mjs` — client build step.

**Current GitHub reference:** https://github.com/manidsr/Diep
