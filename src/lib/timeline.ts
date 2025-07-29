// src/lib/timeline.ts
import { getCollection } from 'astro:content';

// --- 1. UPDATE THE INTERFACES ---
interface TimelineNote {
  type: 'Note';
  title: string;
  uid?: string;
  url: string;
  sortDate: Date;
  content: any;
  description?: string; // Add description
  tags?: string[];      // Add tags
}

interface TimelineBook {
  type: 'Book';
  title: string;
  author?: string;
  url: string;
  sortDate: Date;
  content: any;
  description?: string; // Add description
  tags?: string[];      // Add tags
}

export type TimelineItem = TimelineNote | TimelineBook;


// --- 2. UPDATE THE TRANSFORMATION FUNCTIONS ---
async function transformNoteToTimelineItem(item: any): Promise<TimelineNote> {
  const { Content } = await item.render();
  return {
    type: 'Note',
    title: item.data.title,
    uid: item.data.uid,
    url: `/republic/notes/${item.slug}`,
    sortDate: item.data.datePublished,
    content: Content,
    description: item.data.description, // Pass through description
    tags: item.data.tags,              // Pass through tags
  };
}

async function transformLiteratureToTimelineItem(item: any): Promise<TimelineBook> {
  const { Content } = await item.render();
  return {
    type: 'Book',
    title: item.data.title,
    author: item.data.author,
    url: `/republic/literature/${item.slug}`,
    sortDate: item.data.datePublished,
    content: Content,
    description: item.data.description, // Pass through description
    tags: item.data.tags,              // Pass through tags
  };
}


// --- The Main Public Function (No changes needed here) ---
export async function getTimelineItems(): Promise<TimelineItem[]> {
  const publishedNotes = await getCollection('notes', ({ data }) => data.publish === true);
  const publishedLiterature = await getCollection('literature', ({ data }) => data.publish === true);

  const notePromises = publishedNotes.map(transformNoteToTimelineItem);
  const literaturePromises = publishedLiterature.map(transformLiteratureToTimelineItem);

  const allItems = await Promise.all([...notePromises, ...literaturePromises]);
  const sortedItems = allItems.sort((a, b) => new Date(b.sortDate).valueOf() - new Date(a.sortDate).valueOf());
  
  return sortedItems;
}