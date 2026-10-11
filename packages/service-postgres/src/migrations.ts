import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function serviceMigrationsFolder(): string {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDirectory, "../drizzle"),
    path.resolve(currentDirectory, "../../drizzle"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}
