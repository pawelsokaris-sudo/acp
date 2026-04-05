import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnvironment } from '../../src/core/environmentLoader.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('environmentLoader', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('parses valid environment.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'environment.yaml'), `
services:
  - name: api
    host: localhost
    port: 8080
    notes: "Express.js"
important_files:
  - src/index.ts
do_not_touch:
  - migrations/
`);
    const env = loadEnvironment(tmpDir);
    expect(env.services).toHaveLength(1);
    expect(env.services[0].name).toBe('api');
    expect(env.important_files).toEqual(['src/index.ts']);
    expect(env.do_not_touch).toEqual(['migrations/']);
  });

  it('returns empty environment when file missing', () => {
    const env = loadEnvironment(tmpDir);
    expect(env.services).toEqual([]);
    expect(env.important_files).toEqual([]);
    expect(env.do_not_touch).toEqual([]);
  });
});
