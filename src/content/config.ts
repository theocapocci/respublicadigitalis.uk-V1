// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const notesCollection = defineCollection({
  // This schema is now a direct object as no helpers are needed.
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    publish: z.boolean().optional(),
    uid: z.string().min(1).optional(), // Ensures the string is not empty
    datePublished: z.date().optional(),
    dateUpdated: z.date().optional(),
  }),
});

const literatureCollection = defineCollection({
  // Kept the function-based schema as provided.
  schema: ({ image }) => z.object({
    title: z.string(),
    author: z.string(),
    description: z.string().optional(),
    cover: image().optional(),
    tags: z.array(z.string()).optional(),
    publish: z.boolean().optional(),
    datePublished: z.date().optional(),
    dateUpdated: z.date().optional(),
  }),
});

export const collections = {
  notes: notesCollection,
  literature: literatureCollection
};