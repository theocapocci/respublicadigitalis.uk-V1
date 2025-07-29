// src/content/config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';


const notesCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }), // Here's the loader!
  schema: ({ image }) => z.object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    publish: z.boolean().optional(),
    uid: z.string().optional(),
    datePublished: z.date().optional(),
    dateUpdated: z.date().optional(),
  }),
});

const literatureCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/literature' }), // Here's the loader!
  schema: ({ image }) => z.object({
    title: z.string(),
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