import { z } from "zod";
import { BidError } from "./domain.js";
export const uuid = z.string().uuid();
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      Number.isFinite(new Date(`${s}T00:00:00Z`).getTime()) &&
      new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s,
  );
export function pagination(query: unknown) {
  const input = z
    .object({
      cursor: z.string().max(32).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      date: day.optional(),
    })
    .parse(query);
  const decoded = input.cursor
    ? Buffer.from(input.cursor, "base64url").toString()
    : "0";
  if (!/^\d{1,7}$/.test(decoded))
    throw new BidError("INVALID_CURSOR", "Invalid page cursor.", 400);
  return { ...input, offset: Number(decoded) };
}
