import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {playbook, toolList} from '../src/agent/guide';

const nodeServer = 'mcp/aphrodite-mcp/index.mjs';

test('a closed app still supplies its playbook to the Node client', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aph-guide-'));
  try {
    const result = execFileSync(process.execPath, [nodeServer], {
      env:{...process.env, APHRODITE_ENDPOINT_FILE:join(dir,'absent')},
      input:'{"id":1,"method":"tools/call","params":{"name":"aphrodite_guide"}}\n', encoding:'utf8',
    });
    const {isError,content} = JSON.parse(result).result;
    assert.equal(isError, false);
    assert.equal(content[0].text.split('## Right now')[0],playbook+'\n\n'+toolList+'\n\n');
    assert.match(content[0].text, /^# Working with Aphrodite[\s\S]+open the app/i);
  } finally { rmdirSync(dir); }
});
