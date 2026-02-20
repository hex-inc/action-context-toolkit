import { z } from "zod";

export const TransformSchema = z.object({
  stripFolders: z.boolean().optional(),
});

export type TransformSchema = z.infer<typeof TransformSchema>;

export const GuideSchema = z.union([
  z.object({
    path: z.string(),
    hexFilePath: z.string().optional(),
  }),
  z.object({
    pattern: z.string(),
    transform: TransformSchema.optional(),
  }),
]);

export type GuideSchema = z.infer<typeof GuideSchema>;

export const ConfigSchema = z.object({
  guides: z.array(GuideSchema).optional(),
});
export type ConfigSchema = z.infer<typeof ConfigSchema>;
