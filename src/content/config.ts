// src/content/config.ts
import { defineCollection, z } from 'astro:content';

// Define the 'notes' content collection
const notes = defineCollection({ // Changed collection name from 'republic' to 'notes'
  type: 'content',
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).optional(),
    // Use 'dr-publish' in the TypeScript schema for the 'dr-publish' frontmatter key
    'dr-publish': z.boolean().optional(),
    // Add any other frontmatter fields you use in Obsidian
  }),
});

export const collections = { notes }; // Export the 'notes' collection
