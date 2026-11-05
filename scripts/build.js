'use strict';

// Static production output: no bundling or runtime dependencies are needed.
const { cpSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const output = join(__dirname, '..', 'dist');
mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'contact.html', 'privacy.html', 'support.html', 'terms.html', 'site.js', 'analytics.js', 'assets']) {
  cpSync(join(__dirname, '..', file), join(output, file), { recursive: true });
}
console.log('Static production site written to dist/');
