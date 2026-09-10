import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vaultHtml,type Vault} from '../src/workspace/vault';
test('vault treats document names and source paths as data',()=>{const v:Vault={path:'/local/<script>',snapshot:'snapshot-abc',files:[{name:'<img>.md',kind:'document',bytes:20}],externalReferences:[{}]};const html=vaultHtml(v);assert.doesNotMatch(html,/<script>|<img>/);assert.match(html,/&lt;img&gt;.md/);assert.match(html,/1건은 파일로 복사되지 않았습니다/);assert.match(html,/data-action="vault-read"/);assert.match(html,/같은 이름으로 덮어쓰지 않습니다/);});
