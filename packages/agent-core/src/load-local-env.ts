import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

export function loadLocalEnvFile(): string | null {
  const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
  const envPath = path.resolve(invocationDirectory, ".env.local");
  if (!existsSync(envPath)) return null;
  loadEnvFile(envPath);
  return envPath;
}
