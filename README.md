# FocusDrive website

Five static HTML pages share `assets/styles.css`, `site.js`, and `analytics.js`.
No framework or production JavaScript dependencies are required.

## Serving the site

Serve this folder with any static web server. No dependency installation or build
step is required. Publish the five HTML pages, `assets/`, `site.js`, and
`analytics.js`.

Optional JavaScript syntax checks, if Node.js is available:

```sh
node --check site.js
node --check analytics.js
```

## Website analytics

Umami is loaded from `https://analytics.ahmeto.com/script.js` only after explicit,
successfully saved acceptance. Website ID: `ff05d349-3f70-41d9-94d3-8da8f6d0302e`.
`focusdrive.umami-consent.v1` remembers acceptance and rejection in local storage;
a separate session-storage blocking flag and an in-memory guard protect withdrawal
when saving fails. Nothing reads a previous analytics provider's consent.

Automatic tracking is disabled. The site sends basic pageviews on load and path
navigation only. A before-send guard checks current consent, rejects custom events
and identification, and strips queries and fragments from page and referrer URLs.
The guard remains installed after withdrawal; removing a script cannot disable
an already executed tracker. No reload is used for consent changes.

Storage events synchronize saved preferences; BroadcastChannel additionally
broadcasts withdrawals when storage writes fail. If both browser mechanisms are
unavailable, another tab cannot be notified of an unsaved change. If all storage
fails, a rejection can only be held in memory for that document; the site reports
this and keeps tracking blocked there. Already sent requests cannot be recalled.

The privacy notice at `privacy.html#website-analytics` covers the website separately
from the existing iOS app disclosures. Analytics hosting is the developer's Hetzner
server in Germany; analytics retention is indefinite unless manually deleted.

Runtime configuration follows the
[Umami tracker documentation](https://docs.umami.is/docs/tracker-configuration).
