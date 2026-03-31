/**
 * Merges multiple electron-builder update yml files for the same platform
 * but different architectures into a single yml file.
 *
 * Usage: node merge-update-ymls.js <output> <input1> <input2> [input3...]
 *
 * See: https://github.com/electron-userland/electron-builder/issues/5592
 */

import { readFileSync, writeFileSync } from 'fs'
import { parse, stringify } from 'yaml'

const [, , outputPath, ...inputPaths] = process.argv

if (!outputPath || inputPaths.length < 2) {
    console.error('Usage: node merge-update-ymls.js <output> <input1> <input2> [input3...]')
    process.exit(1)
}

const docs = inputPaths.map((path) => {
    const content = readFileSync(path, 'utf8')
    return parse(content)
})

// Start with the first document as base
const merged = { ...docs[0] }

// Merge files arrays from all documents and dedupe by URL/path.
const allFiles = []
for (const doc of docs) {
    if (doc.files) {
        allFiles.push(...doc.files)
    }
}
merged.files = Array.from(new Map(allFiles.map((file) => [file.url ?? file.path, file])).values())

// Merge Windows package metadata by architecture.
const allPackages = {}
for (const doc of docs) {
    if (doc.packages) {
        Object.assign(allPackages, doc.packages)
    }
}
if (Object.keys(allPackages).length > 0) {
    merged.packages = allPackages
}

// Use the most recent releaseDate
const dates = docs.map((d) => new Date(d.releaseDate)).filter((d) => !isNaN(d.getTime()))
if (dates.length > 0) {
    merged.releaseDate = dates.sort((a, b) => b.getTime() - a.getTime())[0].toISOString()
}

// Keep deprecated top-level path/sha512 aligned with a sensible primary file
// for older updaters/tools that still read them.
const preferredFile =
    merged.files.find((file) => file.url?.endsWith('.zip')) ??
    merged.files.find((file) => file.url?.endsWith('.exe')) ??
    merged.files[0]

if (preferredFile?.url) {
    merged.path = preferredFile.url
}
if (preferredFile?.sha512) {
    merged.sha512 = preferredFile.sha512
}

const output = stringify(merged)
writeFileSync(outputPath, output, 'utf8')

console.log(`Merged ${inputPaths.length} yml files into ${outputPath}`)
console.log(output)
