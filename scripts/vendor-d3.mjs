
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = path.join(root, 'node_modules/d3');
try {
  const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.version !== '7.9.0') throw new Error(`Expected D3 7.9.0, received ${metadata.version}`);
  const target = path.join(root, 'dist/vendor');
  await mkdir(target, {recursive:true});
  await copyFile(path.join(packageRoot, 'dist/d3.min.js'), path.join(target, 'd3.v7.min.js'));
  await copyFile(path.join(packageRoot, 'LICENSE'), path.join(target, 'D3-LICENSE.txt'));
  await writeFile(path.join(root, 'dist/d3-config.js'), 'export const LOCAL_D3 = true;\n');
  console.log('D3 7.9.0 bundled in dist/vendor. Local use is now independent of a CDN.');
} catch (error) {
  console.error('D3 bundling failed:', error.message);
  process.exitCode = 1;
}
