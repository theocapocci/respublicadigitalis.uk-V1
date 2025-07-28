// scripts/sync-obsidian.js

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import slugify from 'slugify';

// --- Main Configuration ---
const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || 'C:/Users/theob/Documents/Obsidian/obsidian-vault';
const ASTRO_PUBLIC_ASSETS_PATH = path.resolve('./public/assets'); // Destination for images and other assets

// YAML frontmatter key to check for publishing.
// Notes with 'dr-publish: true' will be synced.
const PUBLISH_FRONTMATTER_KEY = 'dr-publish';

/**
 * --- Sync Configurations ---
 */
const syncConfigs = [
    {
        name: 'Literature Notes',
        obsidianDir: path.join(OBSIDIAN_VAULT_PATH, 'literature'), // Assumes notes are in a "literature" subfolder.
        astroDir: path.resolve('./src/content/literature'),
        linkPrefix: '/literature/'
    },
    {
        name: 'General Notes',
        obsidianDir: path.join(OBSIDIAN_VAULT_PATH, 'notes'), // Assumes general notes are in a "notes" subfolder.
        astroDir: path.resolve('./src/content/notes'),
        linkPrefix: '/notes/'
    }
];

console.log('Starting Obsidian Digital Republic sync...');
console.log(`Obsidian Vault: ${OBSIDIAN_VAULT_PATH}`);

/**
 * The main synchronization function.
 */
async function syncContent() {
    try {
        const allPublishedNotes = [];
        const slugMap = new Map();

        // --- First Pass: Collect all publishable notes from all configurations ---
        console.log('--- Pass 1: Identifying all notes for publication ---');
        for (const config of syncConfigs) {
            console.log(`Searching for notes in: ${config.name}`);

            await fs.emptyDir(config.astroDir);
            console.log(`Cleaned destination directory: ${config.astroDir}`);

            const obsidianFiles = await getMarkdownFiles(config.obsidianDir);
            console.log(`Found ${obsidianFiles.length} markdown files in ${config.obsidianDir}`);

            for (const filePath of obsidianFiles) {
                const fileContent = await fs.readFile(filePath, 'utf8');
                const { data, content } = matter(fileContent);

                if (data[PUBLISH_FRONTMATTER_KEY] === true) {
                    const fileName = path.basename(filePath, '.md');
                    const slug = slugify(data.title, { lower: true, strict: true });

                    allPublishedNotes.push({
                        filePath,
                        fileName,
                        slug,
                        data,
                        content,
                        config,
                    });

                    slugMap.set(fileName, { slug, linkPrefix: config.linkPrefix });
                }
            }
        }
        console.log(`Identified ${allPublishedNotes.length} total notes for publication.`);

        // --- Second Pass: Process notes, transform links, and copy assets ---
        console.log('\n--- Pass 2: Processing notes and transforming links ---');
        await fs.ensureDir(ASTRO_PUBLIC_ASSETS_PATH);

        for (const note of allPublishedNotes) {
            let transformedContent = note.content;

            // Handle the primary display image from frontmatter
            if (note.data.image) {
                const imageName = path.basename(note.data.image);
                await copyAsset(imageName, OBSIDIAN_VAULT_PATH, ASTRO_PUBLIC_ASSETS_PATH);
                const assetSlug = slugify(imageName, { lower: true, strict: true });
                note.data.image = `/assets/${assetSlug}`;
            }

            // Transform internal Obsidian links [[Note Name]] -> [/collection/note-slug]
            transformedContent = transformedContent.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (match, noteName, alias) => {
                const targetNoteName = noteName.trim();
                const targetInfo = slugMap.get(targetNoteName);
                const linkText = alias ? alias.trim() : targetNoteName;

                if (targetInfo) {
                    return `[${linkText}](${targetInfo.linkPrefix}${targetInfo.slug})`;
                } else {
                    console.warn(`[Warning] In "${note.fileName}", linked note "${targetNoteName}" was not found or not published. Link kept as is.`);
                    return match;
                }
            });

            // Transform Obsidian embeds ![[Asset.png]] -> ![Asset.png](/assets/asset.png) and copy the asset
            const assetRegex = /!\[\[([^\]]+)\]\]/g;
            const assetPromises = [];
            
            transformedContent.replace(assetRegex, (match, assetName) => {
                assetPromises.push(copyAsset(assetName.trim(), OBSIDIAN_VAULT_PATH, ASTRO_PUBLIC_ASSETS_PATH));
                return match;
            });
            
            await Promise.all(assetPromises);
            
            transformedContent = transformedContent.replace(assetRegex, (match, assetName) => {
                const cleanAssetName = assetName.trim();
                const assetSlug = slugify(cleanAssetName, { lower: true, strict: true });
                return `![${cleanAssetName}](/assets/${assetSlug})`;
            });

            // Re-compose frontmatter and content, then write to the destination.
            const outputContent = matter.stringify(transformedContent, note.data);
            const outputPath = path.join(note.config.astroDir, `${note.slug}.md`);

            await fs.writeFile(outputPath, outputContent, 'utf8');
            console.log(`Published: ${note.fileName} -> ${path.relative(process.cwd(), outputPath)}`);
        }

        console.log('\nObsidian Digital Republic sync completed successfully!');

    } catch (error) {
        console.error('Error during Obsidian Digital Republic sync:', error);
        process.exit(1);
    }
}

/**
 * Recursively finds all markdown files in a given directory, skipping hidden ones.
 */
async function getMarkdownFiles(dir) {
    if (!await fs.pathExists(dir)) {
        console.warn(`[Warning] Directory not found: ${dir}. Skipping.`);
        return [];
    }
    let markdownFiles = [];
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            if (item.name.startsWith('.')) continue;
            markdownFiles = markdownFiles.concat(await getMarkdownFiles(fullPath));
        } else if (item.isFile() && item.name.endsWith('.md')) {
            markdownFiles.push(fullPath);
        }
    }
    return markdownFiles;
}

/**
 * Finds an asset anywhere in the vault, copies it to the Astro assets folder, and slugs the name.
 */
async function copyAsset(assetName, vaultPath, astroAssetsPath) {
    try {
        const sourcePath = await findFile(assetName, vaultPath);
        if (sourcePath) {
            const assetSlug = slugify(assetName, { lower: true, strict: true });
            const destinationPath = path.join( astroAssetsPath, assetSlug);
            await fs.copy(sourcePath, destinationPath);
        } else {
            console.warn(`[Warning] Asset "${assetName}" not found in vault. It will not be copied.`);
        }
    } catch (error) {
        console.error(`[Error] Failed to copy asset "${assetName}":`, error);
    }
}

// --- Utility to find a file by name recursively ---
const fileCache = new Map();
async function findFile(fileName, dir) {
    if (fileCache.has(fileName)) {
        return fileCache.get(fileName);
    }

    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            if (item.name.startsWith('.')) continue;
            const result = await findFile(fileName, fullPath);
            if (result) {
                fileCache.set(fileName, result);
                return result;
            }
        } else if (item.name === fileName) {
            fileCache.set(fileName, fullPath);
            return fullPath;
        }
    }
    return null;
}

// Run the sync function when the script is executed.
syncContent();