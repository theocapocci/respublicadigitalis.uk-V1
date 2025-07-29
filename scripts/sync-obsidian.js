// scripts/sync-obsidian.js
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import slugify from 'slugify';

// --- Configuration ---
const WEBSITE_PATH = '.';
const VAULT_PATH = process.env.VAULT_PATH;

if (!VAULT_PATH) {
    console.error("Fatal: VAULT_PATH environment variable not set.");
    process.exit(1);
}

// --- ADDED: New paths for content-based images ---
const ASTRO_BOOK_IMAGES_PATH = path.join(WEBSITE_PATH, 'src/content/images/books');
const ASTRO_NOTE_IMAGES_PATH = path.join(WEBSITE_PATH, 'src/content/images/notes');

// --- NEW HELPER FUNCTION ---
// This correctly slugifies the filename while preserving the extension.
function slugifyAsset(filename) {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const slugifiedBaseName = slugify(baseName, { lower: true, strict: true });
    return `${slugifiedBaseName}${ext}`;
}

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
    }
];

console.log(`Syncing from Vault: ${VAULT_PATH}`);
console.log(`Syncing to Website: ${WEBSITE_PATH}`);

async function syncContent() {
    try {
        const noteConfigs = syncConfigs.filter(c => c.linkPrefix);
        
        const allPublishedNotes = [];
        const slugMap = new Map();

        console.log('\n--- Pass 1: Identifying notes for publication ---');
        for (const config of noteConfigs) {
            await fs.emptyDir(config.astroDir);
            const obsidianFiles = await getMarkdownFiles(config.obsidianDir);
            console.log(`\nFound ${obsidianFiles.length} markdown files in ${config.name}.`);

            for (const filePath of obsidianFiles) {
                const fileName = path.basename(filePath);
                const fileContent = await fs.readFile(filePath, 'utf8');
                const { data, content } = matter(fileContent);

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
            console.warn("\nWarning: No notes were published.");
        }

        console.log('\n--- Pass 2: Processing and writing notes ---');
        for (const note of allPublishedNotes) {
            let transformedContent = note.content;
            
            // --- CHANGED: Logic for handling frontmatter images ---
            if (note.data.image) {
                const imageName = path.basename(note.data.image);
                // 1. Copy asset to the new 'books' image folder
                await copyAsset(imageName, VAULT_PATH, ASTRO_BOOK_IMAGES_PATH);
                const assetSlug = slugifyAsset(imageName);
                // 2. Update frontmatter to use a relative path
                note.data.image = `../../images/books/${assetSlug}`;
            }

            transformedContent = transformedContent.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (match, noteName, alias) => {
                const targetNoteName = noteName.trim();
                const targetInfo = slugMap.get(targetNoteName);
                const linkText = alias ? alias.trim() : targetNoteName;
                if (targetInfo) return `[${linkText}](${targetInfo.linkPrefix}${targetInfo.slug})`;
                return match;
            });

            // --- CHANGED: Logic for handling embedded images ---
            const assetRegex = /!\[\[([^\]]+)\]\]/g;
            const assetPromises = [];
            transformedContent.replace(assetRegex, (match, assetName) => {
                // 1. Copy asset to the new 'notes' image folder
                assetPromises.push(copyAsset(assetName.trim(), VAULT_PATH, ASTRO_NOTE_IMAGES_PATH));
                return match;
            });
            await Promise.all(assetPromises);

            transformedContent = transformedContent.replace(assetRegex, (match, assetName) => {
                const cleanAssetName = assetName.trim();
                const assetSlug = slugifyAsset(cleanAssetName);
                // 2. Update the link to use a relative path
                return `![${cleanAssetName}](../../images/notes/${assetSlug})`;
            });
            
            // ### START of MODIFICATION ###
            // The `gray-matter` library translates empty YAML fields (e.g., "description:")
            // into `null` values in the data object. To prevent it from writing "description: null"
            // in the output, we must clean the data object before stringifying it.

            // 1. Create a new, clean data object.
            const cleanedData = {};
            for (const key in note.data) {
                // 2. Copy a value only if it is not null.
                if (note.data[key] !== null) {
                    cleanedData[key] = note.data[key];
                }
            }

            // 3. Stringify the content using the cleaned data object.
            const outputContent = matter.stringify(transformedContent, cleanedData);
            // ### END of MODIFICATION ###


            const outputPath = path.join(note.config.astroDir, `${note.slug}.md`);
            await fs.writeFile(outputPath, outputContent, 'utf8');
            console.log(`Published: ${note.fileName} -> ${path.relative(process.cwd(), outputPath)}`);
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

// --- CHANGED: The third argument 'destinationDir' is now used for specific destinations ---
async function copyAsset(assetName, vaultPath, destinationDir) {
    const sourcePath = await findFile(assetName, vaultPath);
    if (sourcePath) {
        const assetSlug = slugifyAsset(assetName);
        const destinationPath = path.join(destinationDir, assetSlug);
        if (!await fs.pathExists(destinationPath)) {
            // Ensure the specific destination directory exists before copying
            await fs.ensureDir(destinationDir);
            await fs.copy(sourcePath, destinationPath);
        }
    } else {
        console.warn(`Warning: Could not find asset "${assetName}" anywhere in the vault.`);
    }
}

const fileCache = new Map();
async function findFile(fileName, dir) {
    if (fileCache.has(fileName)) return fileCache.get(fileName);
    
    const preferredPath = path.join(VAULT_PATH, 'assets', fileName);
    if (await fs.pathExists(preferredPath)) {
        fileCache.set(fileName, preferredPath);
        return preferredPath;
    }
    
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