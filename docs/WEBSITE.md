# The website

[taskpop.asmlab.agency](https://taskpop.asmlab.agency) is a Next.js site in `website/` and is deployed by [Vercel](https://vercel.com). The desktop app stays in `app/` and is not part of the site build.

```text
website/app            pages, layout, and Vercel Web Analytics
website/content        the homepage and privacy page markup
website/lib/site.js    live demo, lid animation, download links
website/app/globals.css
assets/                app icon, favicon, social share image, font (Instrument Sans, OFL)
vercel.json            build command, caching and security headers
```

The privacy policy stays at `/privacy.html`, which is also the Microsoft Store listing's privacy link. Visits are counted with Vercel Web Analytics. The TaskPop app itself still has no analytics.

## Downloads

The download buttons point at the [latest GitHub release](https://github.com/asmrayat/Task-pop/releases/latest). The page also asks GitHub which file is the Mac installer and which is the Windows installer, then starts that download. Publish a newer release and the site offers it without another edit. Pre-releases are left out. If GitHub can't be reached, the buttons still open the latest release page.

## Deploying

When the Vercel project is connected to this repository, every push to `main` deploys the site. The project stays on the **Other** preset. `vercel.json` installs and builds `website/`, then publishes `website/out`. There is no `package.json` at the repository root, so Vercel does not try to build the desktop app.

The custom domain is set under **Project → Settings → Domains**.

## Previewing locally

```sh
cd website
npm install
npm run dev
```

Then open http://localhost:3000.
