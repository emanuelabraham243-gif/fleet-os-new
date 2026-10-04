// Builds FleetOS and packs it for Spaceship cPanel "Setup Node.js App" hosting.
//
//   npm run package:spaceship      ->  dist/fleetos-spaceship.zip
//
// The zip holds the Next.js standalone server (server.js + only the node_modules it needs) plus the
// static assets it serves, so nothing has to be installed on the host. Upload and extract it into the
// Node.js app's root folder and set the application startup file to server.js.
// NEXT_PUBLIC_* values are inlined at build time from .env.local; SITE_URL is read at runtime and is
// set in the cPanel app's environment variables.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');
const dist = join(root, 'dist');
const zip = join(dist, 'fleetos-spaceship.zip');

execSync('npx next build', { stdio: 'inherit' });
if (!existsSync(join(standalone, 'server.js'))) {
  console.error('No .next/standalone/server.js - is output: "standalone" set in next.config.ts?');
  process.exit(1);
}

// server.js serves these itself once they sit next to it (see the Next.js `output` docs).
cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true });
// Secrets never ship in the bundle; runtime config comes from the host's environment variables.
for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  rmSync(join(standalone, f), { force: true });
}

mkdirSync(dist, { recursive: true });
rmSync(zip, { force: true });
// bsdtar (bundled with Windows 10+ and macOS) writes a zip with -a; on Windows call it by full path so
// Git Bash's GNU tar (no zip support) is not picked up. "." keeps the hidden .next folder.
if (process.platform === 'win32') {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  execSync(`"${tar}" -a -c -f "${zip}" -C "${standalone}" .`, { stdio: 'inherit' });
} else if (process.platform === 'darwin') {
  execSync(`tar -a -c -f "${zip}" -C "${standalone}" .`, { stdio: 'inherit' });
} else {
  execSync(`zip -qr "${zip}" .`, { cwd: standalone, stdio: 'inherit' });
}
console.log(`\nPackaged: ${zip}`);
