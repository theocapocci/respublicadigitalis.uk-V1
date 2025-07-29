// src/lib/timeline.ts
import { getCollection, type CollectionEntry } from 'astro:content';

// --- TYPE DEFINITIONS (Our "Contract") ---
interface TimelineNote { type: 'Note'; title: string; uid?: string; url: string; sortDate: Date; content: any; description?: string; tags?: string[]; }
interface TimelineBook { type: 'Book'; title: string; author?: string; url: string; sortDate: Date; content: any; description?: string; tags?: string[]; }
export type TimelineItem = TimelineNote | TimelineBook;

interface HomepageTimelineItem { type: 'Note' | 'Book'; title: string; url: string; sortDate: Date; }


// --- FULL CONTENT TRANSFORMATION FUNCTIONS (For /republic/ page) ---

// FIX: Explicitly type 'item' as a 'notes' collection entry
async function transformNoteToTimelineItem(item: CollectionEntry<'notes'>): Promise<TimelineNote> {
  const { Content } = await item.render();
  return {
    type: 'Note',
    title: item.data.title,
    uid: item.data.uid,
    url: `/republic/notes/${item.slug}`,
    sortDate: item.data.datePublished,
    content: Content,
    description: item.data.description,
    tags: item.data.tags,
  };
}

// FIX: Explicitly type 'item' as a 'literature' collection entry
async function transformLiteratureToTimelineItem(item: CollectionEntry<'literature'>): Promise<TimelineBook> {
  const { Content } = await item.render();
  return {
    type: 'Book',
    title: item.data.title,
    author: item.data.author,
    url: `/republic/literature/${item.slug}`,
    sortDate: item.data.datePublished,
    content: Content,
    description: item.data.description,
    tags: item.data.tags,
  };
}

export async function getTimelineItems(): Promise<TimelineItem[]> {
  const publishedNotes = await getCollection('notes', ({ data }) => data.publish === true);
  const publishedLiterature = await getCollection('literature', ({ data }) => data.publish === true);

  // This part is now type-safe because the functions above are explicit
  const notePromises = publishedNotes.map(transformNoteToTimelineItem);
  const literaturePromises = publishedLiterature.map(transformLiteratureToTimelineItem);

  const allItems = await Promise.all([...notePromises, ...literaturePromises]);
  const sortedItems = allItems.sort((a, b) => new Date(b.sortDate).valueOf() - new Date(a.sortDate).valueOf());
  
  return sortedItems;
}


// --- HOMEPAGE-SPECIFIC FUNCTIONS (No changes needed here, they were already correct) ---

export async function getHomepageTimeline(itemCount: number): Promise<HomepageTimelineItem[]> {
  const notes = await getCollection('notes', ({ data }) => data.publish === true);
  const literature = await getCollection('literature', ({ data }) => data.publish === true);

  const transformedNotes = notes.map(item => ({
    type: 'Note' as const,
    title: item.data.title,
    url: `/republic/notes/${item.slug}`,
    sortDate: item.data.datePublished,
  }));

  const transformedLiterature = literature.map(item => ({
    type: 'Book' as const,
    title: item.data.title,
    url: `/republic/literature/${item.slug}`,
    sortDate: item.data.datePublished,
  }));

  const allItems = [...transformedNotes, ...transformedLiterature]
    .sort((a, b) => new Date(b.sortDate).valueOf() - new Date(a.sortDate).valueOf());

  return allItems.slice(0, itemCount);
}

export async function getRecentLibraryItems(itemCount: number) {
  const items = await getCollection('literature', ({ data }) => data.publish === true);
  const sorted = items.sort((a, b) => new Date(b.data.datePublished).valueOf() - new Date(a.data.datePublished).valueOf());
  return sorted.slice(0, itemCount);
}

export async function getRecentNotes(itemCount: number) {
  const items = await getCollection('notes', ({ data }) => data.publish === true);
  const sorted = items.sort((a, b) => new Date(b.data.datePublished).valueOf() - new Date(a.data.datePublished).valueOf());
  return sorted.slice(0, itemCount);
}