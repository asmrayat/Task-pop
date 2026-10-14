import "./globals.css";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const description =
  "TaskPop slides your to-do list in from the side of the screen when you start your computer, and comes back with a double-tap of Control from any app. Categories, timers, reminders, daily routines, Google Calendar and a quick note with encrypted hidden text. Free for Mac and Windows, and your tasks stay on your computer.";

export const metadata = {
  applicationName: "TaskPop",
  keywords: ["to-do list", "todo app", "task manager", "Mac", "Windows", "menu bar", "productivity", "open source"],
  metadataBase: new URL("https://taskpop.asmlab.agency"),
  title: {
    default: "TaskPop – Your to-do list, there when you start your computer",
    template: "%s",
  },
  description,
  icons: {
    icon: "/assets/favicon.png",
    apple: "/assets/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: "https://taskpop.asmlab.agency/",
    title: "TaskPop – Your to-do list, there when you start your computer",
    description:
      "A to-do list that slides in when you start your computer and comes back with a double-tap. Categories, timers, reminders and a private quick note. Free for Mac and Windows.",
    images: [{ url: "https://taskpop.asmlab.agency/assets/og-image.png?v=1.9", width: 1200, height: 630, alt: "TaskPop: your to-do list, a double-tap away, on Mac and Windows" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TaskPop – Your to-do list, there when you start your computer",
    description: "A to-do list that slides in when you start your computer and comes back with a double-tap. Free for Mac and Windows.",
    images: ["https://taskpop.asmlab.agency/assets/og-image.png?v=1.9"],
  },
};

export const viewport = {
  themeColor: "#F4F7F5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/assets/fonts/InstrumentSans.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Script id="detect-os" strategy="beforeInteractive">
          {`(function () {
            var ua = navigator.userAgent || '';
            var apple = /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            var os = /Windows/i.test(ua) ? 'windows' : (apple ? 'macos' : '');
            if (os) document.documentElement.setAttribute('data-os', os);
          })();`}
        </Script>
        <noscript>
          <style>{`.device.closed .lid { transform: none; } .device.closed .screen-off { opacity: 0; } .tp-panel { display: none !important; } .demo-controls { display: none; }`}</style>
        </noscript>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
