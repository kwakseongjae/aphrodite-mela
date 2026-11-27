import {invoke} from '@tauri-apps/api/core';
import {refusal, type Dispatch} from '../agent/dispatch';
import type {StoredMedia} from '../free-page';
import type {GrantedFiles} from './html';

type Chosen = {grant: string; names: string[]; overflow: number};
function credential() {
  const shell = typeof window !== 'undefined' && (window as Window & {__APHRODITE_IMPORT__?: string}).__APHRODITE_IMPORT__;
  if (!shell) throw 'person_only';
  return shell;
}

function files({grant, names, overflow}: Chosen, shell: string): GrantedFiles {
  return Object.freeze({overflow, names: Object.freeze(names),
    read: async (name: string, kind: 'document' | 'style' | 'script', limit: number) => new Uint8Array(await invoke<ArrayBuffer>('html_import_read', {shell, grant, name, kind, limit})),
    media: (name: string, limit: number) => invoke<StoredMedia & {receipt?: string}>('html_import_media', {shell, grant, name, limit}),
    finish: async (kept: string[], staged: (StoredMedia & {receipt?: string})[]) => {
      const accepted = new Set(kept);
      const receipts = staged.flatMap(f => f.receipt ? [[f.receipt, accepted.has(f.sha)]] : []);
      if (receipts.length) await invoke('html_import_finish', {shell, receipts});
    },
  });
}

/** The open panel returns a capability (or null on cancel). Its caller never supplies a path. */
export async function pickHtml(folder: boolean, dispatch: Dispatch | undefined): Promise<GrantedFiles | null> {
  if (refusal(dispatch, 'edit.import-html') || refusal(dispatch, 'outside.import')) throw 'person_only';
  const shell = credential();
  const chosen = await invoke<Chosen | null>('html_import_pick', {shell, folder});
  return chosen && files(chosen, shell);
}

/** The native event is a wake-up only. The source and its authority arrive from Rust, never its payload. */
export async function takeGrantedHtml(): Promise<GrantedFiles[]> {
  const shell = credential();
  const chosen = await invoke<Chosen[]>('html_import_take', {shell});
  return chosen.map(item => files(item, shell));
}
