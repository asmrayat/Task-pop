# TaskPop landing site

A single static page, ready for Vercel. No build step and no framework.

```
index.html      page content
styles.css      design
script.js       live demo, lid animation, download links
assets/         app icon, favicon, social share image, font (Instrument Sans, OFL)
vercel.json     caching + security headers
```

## Downloads

The download buttons point at the latest GitHub release:

https://github.com/asmrayat/Task-pop/releases/latest

The page also asks GitHub which file is the Mac installer and which is the Windows installer, then starts that download. Publish a newer release and the site offers it without another edit. Pre-releases are left out. If GitHub can’t be reached, the buttons still open the latest release page.

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
