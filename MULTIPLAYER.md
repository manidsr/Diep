# Multiplayer hosting

Default: 64 players per mode (FFA, Teams, Survival, Royale). Configure a limit from 2 to 128 per mode. This is an admission limit, not a guaranteed performance rating. Benchmark your host and connection before increasing it.

Windows CMD:

```cmd
set DIEP_MAX_PLAYERS=64
npm start
```

Linux/macOS:

```sh
DIEP_MAX_PLAYERS=64 npm start
```

Use a wired connection to the router for LAN sessions. Players join the LAN URL printed at startup. For internet play, deploy the Node.js server on a suitable host behind a TLS-enabled reverse proxy supporting WebSocket upgrades. Disable developer cheats on public servers. Keep port 3000 private behind the proxy; use a firewall and rate limits at the edge. The server has no player accounts or internet-scale DDoS protection.

The server retains authoritative 30 Hz physics. World snapshot packing is shared across recipients; bullet visibility queries use a spatial index. Slow connections skip obsolete snapshots instead of accumulating them. Sustained backpressure triggers reconnect. Clients use adaptive interpolation and viewport rendering culling. The Survival minimap keeps distant entities. A 64-client integration test exercises admission and advancing snapshots; actual sustainable player counts depend on CPU, bandwidth, class mix and game mode.
