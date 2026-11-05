const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:8765' },
  webServer: {
    command: 'npm run build && python3 -m http.server 8765 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: false,
  },
});
