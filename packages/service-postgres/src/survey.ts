import { eq } from "drizzle-orm";

import {
  BetaSurveyResponseSchema,
  UserIdSchema,
  type BetaSurveyRepository,
  type BetaSurveyResponse,
} from "@project/service-core";

import type { ServicePostgresDb } from "./db.js";
import { betaSurveyResponses } from "./schema.js";

export class PostgresBetaSurveyRepository implements BetaSurveyRepository {
  constructor(private readonly db: ServicePostgresDb) {}

  async upsert(input: BetaSurveyResponse): Promise<void> {
    const response = BetaSurveyResponseSchema.parse(input);
    await this.db
      .insert(betaSurveyResponses)
      .values({
        userId: response.userId,
        willingnessToPay: response.willingnessToPay,
        updatedAt: new Date(response.updatedAt),
      })
      .onConflictDoUpdate({
        target: betaSurveyResponses.userId,
        set: {
          willingnessToPay: response.willingnessToPay,
          updatedAt: new Date(response.updatedAt),
        },
      });
  }

  async get(userIdInput: string): Promise<BetaSurveyResponse | null> {
    const userId = UserIdSchema.parse(userIdInput);
    const rows = await this.db
      .select()
      .from(betaSurveyResponses)
      .where(eq(betaSurveyResponses.userId, userId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return BetaSurveyResponseSchema.parse({
      userId: row.userId,
      willingnessToPay: row.willingnessToPay,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
}
