import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.platform !== 'darwin') throw new Error('The native OCR prototype currently requires macOS.');
mkdirSync('src-tauri/bin', { recursive: true });
const result = spawnSync('/usr/bin/swiftc', ['-O', '-target', 'arm64-apple-macos13.0', 'src-tauri/native/ReferenceVision.swift', '-o', 'src-tauri/bin/aphrodite-vision'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
