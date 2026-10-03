# The website

[taskpop.asmlab.agency](https://taskpop.asmlab.agency) is a static site that lives at the root of this repository and is deployed by [Vercel](https://vercel.com). No build step and no framework.

```text
index.html         the page
privacy.html       the privacy policy (also the Microsoft Store listing's privacy link)
styles.css         design
script.js          live demo, lid animation, download links
assets/            app icon, favicon, social share image, font (Instrument Sans, OFL)
vercel.json        caching and security headers
.vercelignore      keeps the app, installers, tests and docs out of the deployment
robots.txt, sitemap.xml, google…html   search engines
```

`vercel.json` turns clean URLs off, so pages are reached with their `.html` (for example `/privacy.html`).

## Downloads

The download buttons point at the [latest GitHub release](https://github.com/asmrayat/Task-pop/releases/latest). The page also asks GitHub which file is the Mac installer and which is the Windows installer, then starts that download. Publish a newer release and the site offers it without another edit. Pre-releases are left out. If GitHub can't be reached, the buttons still open the latest release page.

## Deploying

When the Vercel project is connected to this repository (the usual setup), every push to `main` deploys the site. Framework preset: **Other**, with the build command and output directory left empty. Keep the root of the repository free of a `package.json` so Vercel treats the site as plain files; the app's own `package.json` is in `app/`.

From the command line instead: `npx vercel` in the repository root (then `npx vercel --prod`).

The custom domain is set under **Project → Settings → Domains**.

## Previewing locally

Open `index.html` in a browser, or run `npx serve .` in the repository root.
