// scripts/sync-obsidian.js
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import slugify from 'slugify';

// --- Configuration ---

// The script runs from the vault root, so '.' is the vault path.
const VAULT_PATH = '.'; 
// The website path is passed in by the GitHub Action.
const WEBSITE_PATH = process.env.WEBSITE_PATH;

// If the WEBSITE_PATH is not provided, the script cannot run.
if (!WEBSITE_PATH) {
    console.error("Error: WEBSITE_PATH environment variable not set.");
    process.exit(1);
}

const ASTRO_PUBLIC_ASSETS_PATH = path.join(WEBSITE_PATH, 'public/assets');

const syncConfigs = [
    {
        name: 'Literature Notes',
        obsidianDir: path.join(VAULT_PATH, 'literature'),
        astroDir: path.join(WEBSITE_PATH, 'src/content/literature'),
    },
    {
        name: 'General Notes',
        obsidianDir: path.join(VAULT_PATH, 'notes'),
        astroDir: path.join(WEBSITE_PATH, 'src/content/notes'),
    }
];

console.log(`Syncing from Vault: ${VAULT_PATH}`);
console.log(`Syncing to Website: ${WEBSITE_PATH}`);


async function syncContent() {
    try {
        const allPublishedNotes = [];
        const slugMap = new Map();

        console.log('\n--- Pass 1: Identifying notes for publication ---');
        for (const config of syncConfigs) {
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
        // ... (The rest of the script remains the same)

        for (const note of allPublishedNotes) {
            let transformedContent = note.content;
            if (note.data.image) {
                const imageName = path.basename(note.data.image);
                await copyAsset(imageName, OBSIDIAN_VAULT_PATH, ASTRO_PUBLIC_ASSETS_PATH);
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
                assetPromises.push(copyAsset(assetName.trim(), OBSIDIAN_VAULT_PATH, ASTRO_PUBLIC_ASSETS_PATH));
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
        const destinationPath = path.join(astroAssetsPath, assetSlug);
        if (!await fs.pathExists(destinationPath)) await fs.copy(sourcePath, destinationPath);
    }
}

const fileCache = new Map();
async function findFile(fileName, dir) {
    if (fileCache.has(fileName)) return fileCache.get(fileName);
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