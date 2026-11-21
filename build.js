'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const read = name => readFileSync(join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');
const assets = { CSS: 'style.css', CORE: 'core.js', APP: 'app.js' };
const html = read('page.html').replace(/\/\* (CSS|CORE|APP) \*\//g, (_, key) => {
  const content = read(assets[key]);
  if (/<\/(script|style)/i.test(content)) throw new Error('Unexpected closing tag in ' + assets[key]);
  return content;
});
const output = join(__dirname, 'index.html');
if (process.argv.includes('--check')) {
  if (read('index.html') !== html) throw new Error('Build output is stale.');
} else {
  writeFileSync(output, html);
}
