import { startServer } from './server';
import { lanAddresses } from './net';

const port = Number(process.env.PORT) || 3000;
const srv = await startServer({ port, host: '0.0.0.0' });
const addrs = lanAddresses();
console.log(`\nTank arena server running on port ${srv.port} (listening on 0.0.0.0)`);
console.log(`  This laptop:   http://localhost:${srv.port}`);
if (addrs.length) {
  console.log('  Other devices on the same hotspot/Wi-Fi open one of:');
  for (const a of addrs) console.log(`    http://${a}:${srv.port}`);
} else {
  console.log('  No private LAN IPv4 found. Connect the laptop to the hotspot/Wi-Fi first.');
}
console.log('  If other devices cannot connect: allow Node.js on PRIVATE networks in Windows Firewall.\n');
