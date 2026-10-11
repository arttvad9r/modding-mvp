import { createHash, randomBytes, randomUUID } from "node:crypto";

import { ProjectError } from "@project/domain";
import { z } from "zod";

export const UserIdSchema = z.string().uuid();
export const AccessTokenHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const UserLabelSchema = z.string().trim().min(1).max(120);
export const RawAccessTokenSchema = z.string().trim().min(32).max(256);

export const ServiceUserSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: UserIdSchema,
  label: UserLabelSchema,
  tokenHash: AccessTokenHashSchema,
  metricsEligible: z.boolean().default(true),
  createdAt: z.string().datetime({ offset: true }),
  disabledAt: z.string().datetime({ offset: true }).optional(),
});

export type ServiceUser = z.infer<typeof ServiceUserSchema>;

export interface ServiceUserRepository {
  insert(user: ServiceUser): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<ServiceUser | null>;
  get(id: string): Promise<ServiceUser | null>;
}

export interface RateLimitConsumeInput {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: Date;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
}

export interface RateLimitStore {
  consume(input: RateLimitConsumeInput): Promise<RateLimitDecision>;
}

export interface CreateServiceUserOptions {
  readonly label: string;
  readonly userId?: () => string;
  readonly token?: () => string;
  readonly metricsEligible?: boolean;
  readonly now?: () => Date;
}

export interface CreatedServiceUser {
  readonly user: ServiceUser;
  readonly accessToken: string;
}

export function hashAccessToken(rawToken: string): string {
  const token = RawAccessTokenSchema.parse(rawToken);
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createServiceUser(options: CreateServiceUserOptions): CreatedServiceUser {
  const accessToken = RawAccessTokenSchema.parse(
    (options.token ?? (() => `beta_${randomBytes(32).toString("base64url")}`))(),
  );
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const user = ServiceUserSchema.parse({
    schemaVersion: 1,
    id: UserIdSchema.parse((options.userId ?? randomUUID)()),
    label: options.label,
    tokenHash: hashAccessToken(accessToken),
    metricsEligible: options.metricsEligible ?? true,
    createdAt: timestamp,
  });
  return { user, accessToken };
}

export async function authenticateAccessToken(
  repository: ServiceUserRepository,
  rawToken: string,
): Promise<ServiceUser> {
  let tokenHash: string;
  try {
    tokenHash = hashAccessToken(rawToken);
  } catch (error) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "Invalid access token",
      cause: error,
    });
  }

  const user = await repository.findByTokenHash(tokenHash);
  if (user === null || user.disabledAt !== undefined) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "Invalid access token",
    });
  }
  return ServiceUserSchema.parse(user);
}
