import "./globals.css";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const description =
  "TaskPop slides your to-do list in from the side of the screen when you start your computer. Reminders, daily routines, Google Calendar, and a keyboard shortcut. Your tasks stay on your device.";

export const metadata = {
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
      "TaskPop shows your tasks when you start your computer. Reminders, daily routines, and a shortcut from anywhere.",
    images: ["https://taskpop.asmlab.agency/assets/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "TaskPop – Your to-do list, there when you start your computer",
    description: "TaskPop shows your tasks when you start your computer.",
    images: ["https://taskpop.asmlab.agency/assets/og-image.png"],
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
