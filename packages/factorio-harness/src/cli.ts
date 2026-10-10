#!/usr/bin/env node
import path from 'node:path';
import { serializeProjectError } from '@project/domain';
import { runFactorioModTest } from './harness.js';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const rawModPath = args[0];

if (!rawModPath) {
  console.error('Usage: pnpm factorio:test -- <mod-directory>');
  process.exitCode = 2;
} else {
  const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
  const modPath = path.resolve(invocationDirectory, rawModPath);

  try {
    const result = await runFactorioModTest({
      modPath,
      keepTemp: process.env.FACTORIO_KEEP_TMP === '1',
    });

    if (result.ok) {
      console.log(JSON.stringify({ status: 'PASS', durationMs: result.durationMs }, null, 2));
    } else {
      console.error(
        JSON.stringify(
          {
            status: 'FAIL',
            errorType: result.errorType,
            exitCode: result.exitCode,
            signal: result.signal,
            summary: result.summary,
            durationMs: result.durationMs,
            ...(result.workingDirectory ? { workingDirectory: result.workingDirectory } : {}),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: 'ERROR',
          error: serializeProjectError(error, {
            code: 'process_error',
            stage: 'process',
            message: 'Factorio harness failed before validation completed',
          }),
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  }
}
