import { networkInterfaces } from 'os';

function ipv4LanAddresses(): string[] {
  const nets = networkInterfaces();
  const out: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      const fam = net.family as string | number;
      const v4 = fam === 'IPv4' || fam === 4;
      if (v4 && !net.internal) {
        out.push(net.address);
      }
    }
  }
  return [...new Set(out)];
}

/** Log loopback + LAN URLs so you can open the app from other devices on the same network. */
export function printListenUrls(port: number, label: string): void {
  console.log(`\n${label}`);
  console.log(`  Local:  http://127.0.0.1:${port}`);
  const ips = ipv4LanAddresses();
  if (ips.length === 0) {
    console.log('  LAN:    (no non-loopback IPv4 found — Wi‑Fi/Ethernet?)');
  } else {
    for (const ip of ips) {
      console.log(`  LAN:    http://${ip}:${port}`);
    }
  }
  console.log('');
}
