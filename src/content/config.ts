// src/content/config.ts
import { defineCollection, z } from 'astro:content';

// Schema for the "notes" collection
const notesSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
  publish: z.boolean().optional(),
  date: z.date().optional(),
  uid: z.string().optional(),
});

// Schema for the "literature" collection
const literatureSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
  publish: z.boolean().optional(),
  date: z.date().optional(),
});

// Register the collections
export const collections = {
  'notes': defineCollection({ schema: notesSchema }),
  'literature': defineCollection({ schema: literatureSchema }),
};