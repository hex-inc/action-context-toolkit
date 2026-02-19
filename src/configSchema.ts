import { z } from "zod";

export const guideSchema = z.union([
  z.object({
    path: z.string(),
    hexFilePath: z.string().optional(),
  }),
  z.object({
    pattern: z.string(),
  }),
]);

export const configSchema = z.object({
  guides: z.array(guideSchema).optional(),
});
