// src/content/config.ts
import { defineCollection, z } from 'astro:content';

// Schema for the "notes" collection
const notesSchema = z.object({
  title: z.string(),
  description: z.string().optional().nullable(), // Allow string, optional, or null
  image: z.string().optional().nullable(),       // Allow string, optional, or null
  tags: z.array(z.string()).optional().nullable(), // Allow string array, optional, or null
  publish: z.boolean().optional(),
  date: z.date().optional().nullable(),         // Allow date, optional, or null
  uid: z.string().optional().nullable(),        // Allow string, optional, or null
});

// Schema for the "literature" collection (you may want to update this too)
const literatureSchema = z.object({
  title: z.string(),
  description: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  publish: z.boolean().optional(),
  date: z.date().optional().nullable(),
});

// Register the collections
export const collections = {
  'notes': defineCollection({ schema: notesSchema }),
  'literature': defineCollection({ schema: literatureSchema }),
};