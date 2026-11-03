# Tank Arena (LAN)

Diep-style browser tank game. One laptop hosts; PCs and phones on the same hotspot/Wi-Fi join in a browser. No internet or cloud needed.

## Host (Windows laptop)
1. Install Node.js 22+. Connect the laptop to the phone hotspot (or shared Wi-Fi).
2. Double-click `start_server.bat` (or `npm install && npm start`). The console prints the join URLs, e.g. `http://192.168.43.12:3000`.
3. If other devices cannot connect, run `allow_firewall_private.bat` once as Administrator (opens TCP 3000 on **Private** networks only). Never port-forward this to the internet.
4. Change the port with the `PORT` environment variable (the firewall script uses 3000).

## Join
Open the printed `http://<laptop-ip>:3000` URL in any browser on the same network.
- **PC:** WASD/arrows move, mouse aims, click or Space fires, keys 1-8 spend upgrade points.
- **Phone (landscape):** left thumb = move, right thumb = aim + fire; tap the on-screen `+` buttons to upgrade.

Some phone hotspots isolate connected devices (client isolation), or block the hotspot-owner phone from reaching the laptop. That is a hotspot limitation; use another phone/PC as a joiner or a common Wi-Fi router.

## Develop
`npm run typecheck` · `npm test` · `npm run build` · `npm run start:only` (skip rebuild).
Layout: `src/shared` (config, protocol, progression), `src/server` (authoritative sim + HTTP/WS), `src/client` (canvas + HUD), `tests/`.
