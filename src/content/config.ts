// src/content/config.ts
import { defineCollection, z } from 'astro:content';

// Define the 'notes' content collection
const notes = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    desc: z.string(), // 1. ADD THIS LINE: Makes 'desc' a required string.
    tags: z.array(z.string()).optional(),
    // Use 'dr-publish' in the TypeScript schema for the 'dr-publish' frontmatter key
    'dr-publish': z.boolean(), // 2. CHANGED: Made this required by removing .optional().
    // Add any other frontmatter fields you use in Obsidian
  }),
});

export const collections = { notes }; // Export the 'notes' collection