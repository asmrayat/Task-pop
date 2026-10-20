import fs from "fs";
import path from "path";
import Boot from "./boot";

export const metadata = {
  alternates: { canonical: "https://taskpop.asmlab.agency/" },
};

// Tells search engines what TaskPop is: a free app for macOS and Windows
const appInfo = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "TaskPop",
  description:
    "A to-do list that slides in when you start your computer and comes back with a double-tap. Categories, timers, reminders, daily routines, Google Calendar, and Secrets for passwords and codes, encrypted.",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "macOS 13 or later, Windows 10, Windows 11",
  url: "https://taskpop.asmlab.agency/",
  downloadUrl: "https://github.com/asmrayat/Task-pop/releases/latest",
  image: "https://taskpop.asmlab.agency/assets/og-image.png?v=1.10",
  license: "https://opensource.org/licenses/MIT",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Organization", name: "asmlab", url: "https://asmlab.agency" },
};

export default function HomePage() {
  const html = fs.readFileSync(path.join(process.cwd(), "content/home.html"), "utf8");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appInfo) }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Boot />
    </>
  );
}
