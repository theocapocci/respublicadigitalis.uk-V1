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

const ASTRO_PUBLIC_ASSETS_PATH = path.join(WEBSITE_PATH, 'public/assets');

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
        const assetConfigs = syncConfigs.filter(c => !c.linkPrefix);
        
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
            if (note.data.image) {
                const imageName = path.basename(note.data.image);
                await copyAsset(imageName, VAULT_PATH, ASTRO_PUBLIC_ASSETS_PATH);
                // --- FIX: Use the new helper function ---
                const assetSlug = slugifyAsset(imageName);
                note.data.image = assetSlug;
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
                // --- FIX: Use the new helper function ---
                const assetSlug = slugifyAsset(cleanAssetName);
                return `![${cleanAssetName}](/assets/${assetSlug})`;
            });
            const outputContent = matter.stringify(transformedContent, note.data);
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

async function copyAsset(assetName, vaultPath, astroAssetsPath) {
    const sourcePath = await findFile(assetName, vaultPath);
    if (sourcePath) {
        // --- FIX: Use the new helper function ---
        const assetSlug = slugifyAsset(assetName);
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