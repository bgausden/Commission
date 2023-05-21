import { z } from 'zod';

const log4jsConfigSchema = z.object({
    appenders: z.record(z.object({
        type: z.string(),
        filename: z.string().optional(),
        layout: z.object({
            type: z.string()
        }).optional(),
        flags: z.string().optional()
    }).required({type:true})),
    categories: z.record(z.object({
        appenders: z.array(z.string()),
        level: z.string()
    }).required({appenders:true, level:true}))
});

export function validateLog4jsConfig(log4jsConfig: unknown): void {
    log4jsConfigSchema.parse(log4jsConfig);
}
