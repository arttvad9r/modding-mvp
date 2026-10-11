import { z } from "zod";

import { UserIdSchema } from "./auth.js";
import { TimestampSchema } from "./contracts.js";

export const WillingnessToPaySchema = z.enum(["yes", "maybe", "no"]);

export const BetaSurveyResponseSchema = z.strictObject({
  userId: UserIdSchema,
  willingnessToPay: WillingnessToPaySchema,
  updatedAt: TimestampSchema,
});

export type WillingnessToPay = z.infer<typeof WillingnessToPaySchema>;
export type BetaSurveyResponse = z.infer<typeof BetaSurveyResponseSchema>;

export interface BetaSurveyRepository {
  upsert(response: BetaSurveyResponse): Promise<void>;
  get(userId: string): Promise<BetaSurveyResponse | null>;
}
