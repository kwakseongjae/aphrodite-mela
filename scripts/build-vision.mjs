import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.platform !== 'darwin') throw new Error('The native OCR prototype currently requires macOS.');
// Tauri sidecar naming: bin/<name>-<target-triple>. Tauri copies it next to the app binary
// (dev: target/<profile>/, release: Aphrodite.app/Contents/MacOS/) as plain `aphrodite-vision`
// and signs it with the hardened runtime, which notarization requires.
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
const swiftArch = triple.startsWith('aarch64') ? 'arm64' : 'x86_64';
mkdirSync('src-tauri/bin', { recursive: true });
const result = spawnSync('/usr/bin/swiftc', ['-O', '-target', `${swiftArch}-apple-macos13.0`, 'src-tauri/native/ReferenceVision.swift', '-o', `src-tauri/bin/aphrodite-vision-${triple}`], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
