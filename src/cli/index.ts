#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './init.js';
import { startCommand } from './start.js';
import { exportCommand } from './export.js';

const program = new Command();

program
  .name('acp')
  .description('Agent Context Protocol — shared project context for AI agents')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize ACP in the current project (creates .acp/ directory)')
  .action(initCommand);

program
  .command('start')
  .description('Start ACP server on localhost')
  .option('-p, --port <port>', 'Port number', '3075')
  .action(startCommand);

program
  .command('export')
  .description('Print current context to stdout (for agents without curl)')
  .action(exportCommand);

program.parse();
