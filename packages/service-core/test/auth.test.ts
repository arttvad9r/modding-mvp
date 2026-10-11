import { describe, expect, it } from "vitest";

import {
  authenticateAccessToken,
  createServiceUser,
  hashAccessToken,
  type ServiceUser,
  type ServiceUserRepository,
} from "../src/index.js";

class MemoryUsers implements ServiceUserRepository {
  readonly users = new Map<string, ServiceUser>();

  async insert(user: ServiceUser): Promise<void> {
    this.users.set(user.id, user);
  }

  async findByTokenHash(tokenHash: string): Promise<ServiceUser | null> {
    return [...this.users.values()].find((user) => user.tokenHash === tokenHash) ?? null;
  }

  async get(id: string): Promise<ServiceUser | null> {
    return this.users.get(id) ?? null;
  }
}

describe("private-beta access tokens", () => {
  it("creates an opaque token but stores only its SHA-256 hash", async () => {
    const created = createServiceUser({
      label: "Beta tester one",
      userId: () => "77777777-7777-4777-8777-777777777777",
      token: () => "beta_abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
      now: () => new Date("2026-10-11T00:00:00.000Z"),
    });

    expect(created.user).toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      label: "Beta tester one",
      tokenHash: hashAccessToken(created.accessToken),
    });
    expect(JSON.stringify(created.user)).not.toContain(created.accessToken);

    const repository = new MemoryUsers();
    await repository.insert(created.user);
    await expect(authenticateAccessToken(repository, created.accessToken)).resolves.toEqual(created.user);
    await expect(
      authenticateAccessToken(repository, "beta_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcde"),
    ).rejects.toMatchObject({ code: "input_error" });
  });

  it("rejects a valid token after its user is disabled", async () => {
    const repository = new MemoryUsers();
    const created = createServiceUser({ label: "Disabled tester" });
    await repository.insert({
      ...created.user,
      disabledAt: "2026-10-11T01:00:00.000Z",
    });

    await expect(authenticateAccessToken(repository, created.accessToken)).rejects.toMatchObject({
      code: "input_error",
    });
  });
});
