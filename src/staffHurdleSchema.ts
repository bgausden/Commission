import { z } from "zod";

/**
 * Zod schema for individual staff member commission configuration
 */
const staffHurdleItemSchema = z
  .object({
    staffName: z.string(),
    mbCommRate: z.number().min(0).max(1).optional(),
    baseRate: z.number().min(0).max(1),
    hurdle1Level: z.number().optional(),
    hurdle1Rate: z.number().min(0).max(1).optional(),
    hurdle2Level: z.number().optional(),
    hurdle2Rate: z.number().min(0).max(1).optional(),
    hurdle3Level: z.number().optional(),
    hurdle3Rate: z.number().min(0).max(1).optional(),
    contractor: z.boolean(),
    payViaTalenox: z.boolean(),
    customPayRates: z
      .array(z.record(z.string(), z.number().min(0).max(1)))
      .optional(),
    poolsWith: z.array(z.string().regex(/^[0-9]{3}$/)).optional(),
  })
  .refine((data) => !data.hurdle1Level || data.hurdle1Rate !== undefined, {
    message: "hurdle1Rate is required when hurdle1Level is present",
    path: ["hurdle1Rate"],
  })
  .refine((data) => !data.hurdle2Level || data.hurdle2Rate !== undefined, {
    message: "hurdle2Rate is required when hurdle2Level is present",
    path: ["hurdle2Rate"],
  })
  .refine((data) => !data.hurdle3Level || data.hurdle3Rate !== undefined, {
    message: "hurdle3Rate is required when hurdle3Level is present",
    path: ["hurdle3Rate"],
  });

/**
 * Root schema: Record of 3-digit staff IDs to staff configurations
 * Validates the entire staffHurdle.json structure
 */
export const staffHurdleSchema = z.record(
  z.string().regex(/^[0-9]{3}$/),
  staffHurdleItemSchema,
);

// Export inferred type (can replace TStaffHurdles if desired)
export type StaffHurdleConfig = z.infer<typeof staffHurdleSchema>;
