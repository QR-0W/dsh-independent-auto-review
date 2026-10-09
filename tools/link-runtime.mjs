import { execFileSync } from 'node:child_process';
import { readFile, mkdir, lstat, realpath, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeDir = process.env.DSH_RUNTIME_DIR ?? join(
  execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@deepseek-ai/dsh');
const runtime = JSON.parse(await readFile(join(runtimeDir, 'package.json'), 'utf8'));
const project = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'));
if (runtime.version !== '0.2.0-rc.2') throw new Error('Runtime links require DSH 0.2.0-rc.2.');

// Validate all packages before making links. Do not install a second runtime.
const peers = await Promise.all(Object.entries({ ...project.peerDependencies, ...project.devDependencies }).map(async ([name, range]) => {
  const target = join(runtimeDir, 'node_modules', name);
  const metadata = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  const testedVersion = range.replace(/^[~^]/, '');
  if (metadata.version !== testedVersion) throw new Error(`The installed ${name} version is not the tested version ${testedVersion}.`);
  return { name, target, version: metadata.version, destination: join(projectDir, 'node_modules', name) };
}));
for (const peer of peers) {
  let existing;
  try { existing = await lstat(peer.destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (!existing.isSymbolicLink() || await realpath(peer.destination) !== await realpath(peer.target)) {
      throw new Error(`An existing dependency blocks the runtime link for ${peer.name}.`);
    }
  } else {
    await mkdir(dirname(peer.destination), { recursive: true });
    await symlink(peer.target, peer.destination, 'dir');
  }
  console.log(`Linked ${peer.name} ${peer.version}.`);
}
