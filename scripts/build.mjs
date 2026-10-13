import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

await build({
    entryPoints: ['src/index.js'], outfile: 'index.js', bundle: true,
    format: 'esm', target: ['chrome109', 'safari15.4'], minify: true,
    external: ['../../../../script.js', '../../../power-user.js', '../../../personas.js', '../../../extensions.js'],
    banner: { js: '/* Persona Avatar Library 1.0.0 — licenses and design attribution: THIRD_PARTY_LICENSES.md */' },
});
const packages = ['core', 'lorelei', 'adventurer', 'bottts', 'notionists', 'pixel-art'];
let licenses = '# Third-party licenses and artwork attribution\n\nDiceBear 9.2.4. Avatar artwork is generated locally from the following styles.\n\n';
for (const name of packages) {
    licenses += `## @dicebear/${name}\n\n${await readFile(`node_modules/@dicebear/${name}/LICENSE`, 'utf8')}\n\n`;
}
licenses += '## Jimp resizer\n\nJavaScript Image Resizer © 2012 Grant Galitz. Released to the public domain on 29 July 2013: https://github.com/grantgalitz/JS-Image-Resizer/issues/4\n\n';
licenses += await readFile('node_modules/@jimp/plugin-resize/LICENSE', 'utf8');
await writeFile('THIRD_PARTY_LICENSES.md', licenses);
console.log('Built offline extension index.js and THIRD_PARTY_LICENSES.md');
