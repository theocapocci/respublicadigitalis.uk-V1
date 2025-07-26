// scripts/sync-obsidian.js

import fs from 'fs-extra'; // Using fs-extra for more convenient file system operations
import path from 'path';
import matter from 'gray-matter'; // For parsing YAML frontmatter
import slugify from 'slugify'; // For creating clean URL slugs

// --- Configuration ---
const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || 'C:/Users/theob/Documents/Obsidian/obsidian-vault';
const ASTRO_CONTENT_PATH = process.env.ASTRO_CONTENT_PATH || path.resolve('./src/content/notes');


// YAML frontmatter key to check for publishing.
// Notes with 'dr-publish: true' will be synced.
const PUBLISH_FRONTMATTER_KEY = 'dr-publish';

// Prefix for internal links in Astro (e.g., /notes/my-note).
// This determines the public URL structure for individual notes.
const LINK_PREFIX = '/notes/'; // CORRECTED: Now points to /notes/ for individual note URLs

console.log('Starting Obsidian Digital Republic sync...');
console.log(`Obsidian Vault: ${OBSIDIAN_VAULT_PATH}`);
console.log(`Astro Content Destination: ${ASTRO_CONTENT_PATH}`);

async function syncObsidianVault() {
    try {
        // 1. Ensure the destination directory exists and is clean.
        await fs.emptyDir(ASTRO_CONTENT_PATH);
        console.log(`Cleaned destination directory: ${ASTRO_CONTENT_PATH}`);

        // 2. Read all markdown files from the Obsidian vault recursively.
        const obsidianFiles = await getMarkdownFiles(OBSIDIAN_VAULT_PATH);
        console.log(`Found ${obsidianFiles.length} markdown files in Obsidian vault.`);

        const publishedNotes = [];

        // First pass: Identify all notes marked for publication and generate their slugs.
        for (const filePath of obsidianFiles) {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const { data, content } = matter(fileContent);

            // Check if the note is marked for publication.
            if (data[PUBLISH_FRONTMATTER_KEY] === true) {
                const fileName = path.basename(filePath, '.md');
                const slug = slugify(fileName, { lower: true, strict: true });
                publishedNotes.push({
                    filePath,
                    fileName,
                    slug,
                    data,
                    content
                });
            }
        }
        console.log(`Identified ${publishedNotes.length} notes for publication.`);

        // Create a map for quick slug lookup by original Obsidian note file name.
        const slugMap = new Map();
        publishedNotes.forEach(note => slugMap.set(note.fileName, note.slug));

        // Second pass: Process and copy published notes, transforming internal Obsidian links.
        for (const note of publishedNotes) {
            let transformedContent = note.content;

            // Transform internal Obsidian links [[Note Name]] or [[Note Name|Alias]]
            // to standard Markdown links [Note Name](/notes/note-name) or [Alias](/notes/note-name).
            transformedContent = transformedContent.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (match, noteName, alias) => {
                const targetNoteName = noteName.trim();
                const targetSlug = slugMap.get(targetNoteName);
                const linkText = alias ? alias.trim() : targetNoteName;

                if (targetSlug) {
                    return `[${linkText}](${LINK_PREFIX}${targetSlug})`;
                } else {
                    console.warn(`Warning: Linked note "${targetNoteName}" not found or not published. Keeping original link: ${match} in ${note.fileName}`);
                    return match;
                }
            });

            // Transform Obsidian embeds ![[Image Name.png]] to standard Markdown images ![Image Name](/notes/image-name.png)
            transformedContent = transformedContent.replace(/!\[\[([^\]]+)\]\]/g, (match, assetName) => {
                const assetSlug = slugify(assetName.trim(), { lower: true, strict: true });
                return `![${assetName.trim()}](${LINK_PREFIX}assets/${assetSlug})`;
            });

            // Re-compose frontmatter and content for the output file.
            const outputContent = matter.stringify(transformedContent, note.data);
            const outputPath = path.join(ASTRO_CONTENT_PATH, `${note.slug}.md`);

            await fs.writeFile(outputPath, outputContent, 'utf8');
            console.log(`Published: ${note.fileName} -> ${path.basename(outputPath)}`);
        }

        console.log('Obsidian Digital Republic sync completed successfully!');

    } catch (error) {
        console.error('Error during Obsidian Digital Republic sync:', error);
        process.exit(1);
    }
}

/**
 * Recursively finds all markdown files in a given directory.
 * It skips the '.obsidian' directory and other hidden directories.
 * @param {string} dir - The directory to search.
 * @returns {Promise<string[]>} An array of absolute file paths to markdown files.
 */
async function getMarkdownFiles(dir) {
    let markdownFiles = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            if (item.name === '.obsidian' || item.name.startsWith('.')) {
                continue;
            }
            markdownFiles = markdownFiles.concat(await getMarkdownFiles(fullPath));
        } else if (item.isFile() && item.name.endsWith('.md')) {
            markdownFiles.push(fullPath);
        }
    }
    return markdownFiles;
}

// Run the sync function when the script is executed.
syncObsidianVault();
