// scripts/sync-obsidian.js

import fs from 'fs-extra'; // Using fs-extra for more convenient file system operations
import path from 'path';
import matter from 'gray-matter'; // For parsing YAML frontmatter
import slugify from 'slugify'; // For creating clean URL slugs

// --- Configuration ---
// IMPORTANT: Update this path to your actual Obsidian vault location.
// Ensure it's an absolute path or relative to where you run this script.
const OBSIDIAN_VAULT_PATH = 'C:/Users/theob/Documents/Obsidian/obsidian-vault';

// Path where published notes will go in Astro.
// This typically points to a content collection directory (e.g., src/content/republic).
const ASTRO_CONTENT_PATH = path.resolve('./src/content/notes');

// YAML frontmatter key to check for publishing.
// Notes with 'dr-publish: true' will be synced.
const PUBLISH_FRONTMATTER_KEY = 'dr-publish';

// Prefix for internal links in Astro (e.g., /republic/my-note).
// This should match the base path where your republic notes are served in Astro.
const LINK_PREFIX = '/republic/';

console.log('Starting Obsidian Digital Republic sync...');
console.log(`Obsidian Vault: ${OBSIDIAN_VAULT_PATH}`);
console.log(`Astro Content Destination: ${ASTRO_CONTENT_PATH}`);

async function syncObsidianVault() {
    try {
        // 1. Ensure the destination directory exists and is clean.
        // This removes all previously published notes to ensure only current ones are present.
        await fs.emptyDir(ASTRO_CONTENT_PATH);
        console.log(`Cleaned destination directory: ${ASTRO_CONTENT_PATH}`);

        // 2. Read all markdown files from the Obsidian vault recursively.
        const obsidianFiles = await getMarkdownFiles(OBSIDIAN_VAULT_PATH);
        console.log(`Found ${obsidianFiles.length} markdown files in Obsidian vault.`);

        const publishedNotes = [];

        // First pass: Identify all notes marked for publication and generate their slugs.
        // This pass is necessary to build a map of note names to slugs for link transformation.
        for (const filePath of obsidianFiles) {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const { data, content } = matter(fileContent);

            // Check if the note is marked for publication.
            if (data[PUBLISH_FRONTMATTER_KEY] === true) {
                const fileName = path.basename(filePath, '.md');
                // Generate a clean slug from the file name for URL friendly paths.
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
            // to standard Markdown links [Note Name](/republic/note-name) or [Alias](/republic/note-name).
            transformedContent = transformedContent.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (match, noteName, alias) => {
                const targetNoteName = noteName.trim();
                const targetSlug = slugMap.get(targetNoteName); // Look up the slug for the linked note.
                const linkText = alias ? alias.trim() : targetNoteName; // Use alias if provided, otherwise the note name.

                if (targetSlug) {
                    // If the target note is published, create a valid Astro link.
                    return `[${linkText}](${LINK_PREFIX}${targetSlug})`;
                } else {
                    // If the target note is not published, warn and keep the original link.
                    // This allows you to see broken links in your published republic.
                    console.warn(`Warning: Linked note "${targetNoteName}" not found or not published. Keeping original link: ${match} in ${note.fileName}`);
                    return match;
                }
            });

            // Transform Obsidian embeds ![[Image Name.png]] to standard Markdown images ![Image Name](/republic/image-name.png)
            // IMPORTANT: This script only transforms the link. You MUST manually copy your image/asset files
            // from your Obsidian vault to a public directory in your Astro project (e.g., public/republic-assets)
            // and adjust the LINK_PREFIX or target path here accordingly if your assets are not in the same
            // directory as the notes.
            transformedContent = transformedContent.replace(/!\[\[([^\]]+)\]\]/g, (match, assetName) => {
                const assetSlug = slugify(assetName.trim(), { lower: true, strict: true });
                // Assuming assets might be placed in a 'assets' subfolder within the republic.
                // Adjust this path based on where you actually copy your assets.
                return `![${assetName.trim()}](${LINK_PREFIX}assets/${assetSlug})`;
            });

            // Re-compose frontmatter and content for the output file.
            const outputContent = matter.stringify(transformedContent, note.data);
            const outputPath = path.join(ASTRO_CONTENT_PATH, `${note.slug}.md`);

            // Write the transformed content to the Astro content directory.
            await fs.writeFile(outputPath, outputContent, 'utf8');
            console.log(`Published: ${note.fileName} -> ${path.basename(outputPath)}`);
        }

        console.log('Obsidian Digital republic sync completed successfully!');

    } catch (error) {
        console.error('Error during Obsidian Digital republic sync:', error);
        process.exit(1); // Exit with an error code on failure.
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
            // Skip .obsidian directory and any other directories starting with '.'
            if (item.name === '.obsidian' || item.name.startsWith('.')) {
                continue;
            }
            // Recursively search in subdirectories.
            markdownFiles = markdownFiles.concat(await getMarkdownFiles(fullPath));
        } else if (item.isFile() && item.name.endsWith('.md')) {
            // Add markdown files to the list.
            markdownFiles.push(fullPath);
        }
    }
    return markdownFiles;
}

// Run the sync function when the script is executed.
syncObsidianVault();
