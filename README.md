# TaskPop landing site

A single static page, ready for Vercel. No build step and no framework.

```
index.html      page content
styles.css      design
script.js       live demo, lid animation, download links
assets/         app icon, favicon, social share image, font (Instrument Sans, OFL)
vercel.json     caching + security headers
```

## Add the download links

Open `script.js` and paste the `.dmg` URLs at the top:

```js
const DOWNLOADS = {
  appleSilicon: 'https://…/TaskPop-1.2.0-AppleSilicon.dmg',
  intel: 'https://…/TaskPop-1.2.0-Intel.dmg',
};
```

Until they're filled in, the download buttons show "The download will be available here very soon."

The DMGs are about 130 MB each, so host them on GitHub Releases (like TapLaunch)
rather than inside this site, and paste the release asset links above.

When you release a new version, also update the "Version 1.2.0" line in `index.html`.

## Deploy to Vercel

**Dashboard:** push this folder to a GitHub repo → vercel.com → Add New → Project → import the repo.
Framework preset: **Other**. Leave build command and output directory empty. Deploy.

**CLI:** from inside this folder run `npx vercel` (then `npx vercel --prod`).

To use a subdomain like `taskpop.asmlab.agency`, add it under Project → Settings → Domains.
After the domain is live, change the two `og:image` / `twitter:image` values in `index.html`
to the full URL (for example `https://taskpop.asmlab.agency/assets/og-image.png`) so link
previews show the image everywhere.

## Preview locally

Open `index.html` directly in a browser, or run `npx serve .` in this folder.
