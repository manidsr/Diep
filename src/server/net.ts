import { networkInterfaces } from 'node:os';

/** Private IPv4 addresses of this machine (likely LAN/hotspot addresses), hotspot-style ranges first. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) out.push(i.address);
    }
  }
  const rank = (a: string) => (a.startsWith('192.168.') ? 0 : a.startsWith('172.') ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}
