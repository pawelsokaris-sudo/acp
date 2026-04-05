import fs from 'fs';
import path from 'path';
import { buildContext } from '../core/contextBuilder.js';

export async function exportCommand() {
  const acpDir = path.join(process.cwd(), '.acp');

  if (!fs.existsSync(acpDir)) {
    console.error('Error: .acp/ not found. Run "acp init" first.');
    process.exit(1);
  }

  const ctx = await buildContext(acpDir);
  console.log(JSON.stringify(ctx, null, 2));
}
