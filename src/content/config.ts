// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const notesSchema = z.object({
  title: z.string(),
  description: z.string(),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
  publish: z.boolean(),
  date: z.date(),
  uid: z.string().optional(),
});

const literatureSchema = z.object({
  title: z.string(),
  description: z.string(),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
  publish: z.boolean(),
  date: z.date(),
});

export const collections = {
  'notes': defineCollection({ schema: notesSchema }),
  'literature': defineCollection({ schema: literatureSchema }),
};