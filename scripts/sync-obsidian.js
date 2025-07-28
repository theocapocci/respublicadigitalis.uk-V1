// scripts/sync-obsidian.js
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import slugify from 'slugify';


// --- Configuration ---
// The script runs from the website root, so '.' is the website path.
const WEBSITE_PATH = '.';
// The vault path is passed in by the GitHub Action.
const VAULT_PATH = process.env.VAULT_PATH;

// If the VAULT_PATH is not provided, the script cannot run.
if (!VAULT_PATH) {
    console.error("Fatal: VAULT_PATH environment variable not set. This script requires it to find your notes.");
    process.exit(1);
}

const ASTRO_PUBLIC_ASSETS_PATH = path.join(WEBSITE_PATH, 'public/assets');

const syncConfigs = [
    {
        name: 'Literature Notes',
        obsidianDir: path.join(VAULT_PATH, 'literature'),
        astroDir: path.join(WEBSITE_PATH, 'src/content/literature'),
        linkPrefix: '/literature/',
    },
    {
        name: 'General Notes',
        obsidianDir: path.join(VAULT_PATH, 'notes'),
        astroDir: path.join(WEBSITE_PATH, 'src/content/notes'),
        linkPrefix: '/notes/',
    },
    {
        name: 'Images',
        // --- NOTE: This is for bulk-copying the main image folder ---
        obsidianDir: path.join(VAULT_PATH, 'assets/images'),
        astroDir: path.join(WEBSITE_PATH, 'public/assets/images'),
    }
];

console.log(`Syncing from Vault: ${VAULT_PATH}`);
console.log(`Syncing to Website: ${WEBSITE_PATH}`);

async function syncContent() {
    try {
        // --- MODIFICATION: Separate configs for notes and assets ---
        const noteConfigs = syncConfigs.filter(c => c.linkPrefix);
        const assetConfigs = syncConfigs.filter(c => !c.linkPrefix);
        
        const allPublishedNotes = [];
        const slugMap = new Map();

        console.log('\n--- Pass 1: Identifying notes for publication ---');
        // --- MODIFICATION: Loop only over note configurations ---
        for (const config of noteConfigs) {
            await fs.emptyDir(config.astroDir);
            const obsidianFiles = await getMarkdownFiles(config.obsidianDir);
            console.log(`\nFound ${obsidianFiles.length} markdown files in ${config.name}.`);

            for (const filePath of obsidianFiles) {
                const fileName = path.basename(filePath);
                const fileContent = await fs.readFile(filePath, 'utf8');
                const { data, content } = matter(fileContent);

                // **DIAGNOSTIC LOGGING**
                console.log(`\n--- Checking: ${fileName}`);
                console.log('Parsed frontmatter:', data);

                if (data.publish && data.title) {
                    console.log(`✅ Condition MET. Staging for publication.`);
                    const slug = slugify(data.title, { lower: true, strict: true });
                    allPublishedNotes.push({ filePath, fileName: path.basename(filePath, '.md'), slug, data, content, config });
                    slugMap.set(path.basename(filePath, '.md'), { slug, linkPrefix: config.linkPrefix });
                } else {
                    console.log(`❌ Condition FAILED. Skipping file.`);
                }
            }
        }

        console.log(`\n--- Pass 1 Complete: Identified ${allPublishedNotes.length} total notes for publication. ---`);
        if (allPublishedNotes.length === 0) {
            console.warn("\nWarning: No notes were published. Check the logs above to see why files were skipped.");
        }

        console.log('\n--- Pass 2: Processing and writing notes ---');
        // This pass remains the same. It correctly handles individual images
        // referenced in the frontmatter or body of published notes.
        for (const note of allPublishedNotes) {
            let transformedContent = note.content;
            if (note.data.image) {
                const imageName = path.basename(note.data.image);
                await copyAsset(imageName, VAULT_PATH, ASTRO_PUBLIC_ASSETS_PATH);
                const assetSlug = slugify(imageName, { lower: true, strict: true });
                note.data.image = `/assets/${assetSlug}`;
            }
            transformedContent = transformedContent.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (match, noteName, alias) => {
                const targetNoteName = noteName.trim();
                const targetInfo = slugMap.get(targetNoteName);
                const linkText = alias ? alias.trim() : targetNoteName;
                if (targetInfo) return `[${linkText}](${targetInfo.linkPrefix}${targetInfo.slug})`;
                return match;
            });
            const assetRegex = /!\[\[([^\]]+)\]\]/g;
            const assetPromises = [];
            transformedContent.replace(assetRegex, (match, assetName) => {
                assetPromises.push(copyAsset(assetName.trim(), VAULT_PATH, ASTRO_PUBLIC_ASSETS_PATH));
                return match;
            });
            await Promise.all(assetPromises);
            transformedContent = transformedContent.replace(assetRegex, (match, assetName) => {
                const cleanAssetName = assetName.trim();
                const assetSlug = slugify(cleanAssetName, { lower: true, strict: true });
                return `![${cleanAssetName}](/assets/${assetSlug})`;
            });
            const outputContent = matter.stringify(transformedContent, note.data);
            const outputPath = path.join(note.config.astroDir, `${note.slug}.md`);
            await fs.writeFile(outputPath, outputContent, 'utf8');
            console.log(`Published: ${note.fileName} -> ${path.relative(process.cwd(), outputPath)}`);
        }

        // --- NEW FEATURE: Pass 3 for bulk asset syncing ---
        console.log('\n--- Pass 3: Syncing asset folders ---');
        for (const config of assetConfigs) {
            if (await fs.pathExists(config.obsidianDir)) {
                console.log(`Syncing assets from ${config.obsidianDir}`);
                // Ensure the destination directory exists
                await fs.ensureDir(config.astroDir);
                // Copy all files from the vault's assets folder to the website's public folder
                await fs.copy(config.obsidianDir, config.astroDir, { overwrite: true });
                console.log(`✅ Successfully synced ${config.name} to ${config.astroDir}`);
            } else {
                console.warn(`Warning: Asset directory not found, skipping. Path: ${config.obsidianDir}`);
            }
        }

        console.log('\nSync completed successfully!');
    } catch (error) {
        console.error('Error during sync:', error);
        process.exit(1);
    }
}

async function getMarkdownFiles(dir) {
    if (!await fs.pathExists(dir)) return [];
    let files = [];
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            if (item.name.startsWith('.')) continue;
            files = files.concat(await getMarkdownFiles(fullPath));
        } else if (item.isFile() && item.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    return files;
}

async function copyAsset(assetName, vaultPath, astroAssetsPath) {
    const sourcePath = await findFile(assetName, vaultPath);
    if (sourcePath) {
        const assetSlug = slugify(assetName, { lower: true, strict: true });
        // --- MODIFICATION: Copy to the root of public/assets, not a subfolder ---
        const destinationPath = path.join(astroAssetsPath, assetSlug);
        if (!await fs.pathExists(destinationPath)) {
             await fs.copy(sourcePath, destinationPath);
        }
    } else {
        console.warn(`Warning: Could not find asset "${assetName}" anywhere in the vault.`);
    }
}

const fileCache = new Map();
async function findFile(fileName, dir) {
    if (fileCache.has(fileName)) return fileCache.get(fileName);
    
    // Prioritize checking the main assets folder first for efficiency
    const preferredPath = path.join(VAULT_PATH, 'assets', fileName);
    if (await fs.pathExists(preferredPath)) {
        fileCache.set(fileName, preferredPath);
        return preferredPath;
    }
    
    // Fallback to recursive search if not in the main assets folder
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
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

syncContent();