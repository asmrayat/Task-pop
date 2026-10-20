import fs from "fs";
import path from "path";
import Boot from "../boot";

export const metadata = {
  title: "Privacy – TaskPop",
  description: "TaskPop keeps your tasks and secrets on your computer, and your secrets stay encrypted. No account, no tracking, no ads.",
  alternates: { canonical: "https://taskpop.asmlab.agency/privacy.html" },
  openGraph: {
    title: "Privacy – TaskPop",
    description: "TaskPop keeps your tasks and secrets on your computer, and your secrets stay encrypted. No account, no tracking, no ads.",
    url: "https://taskpop.asmlab.agency/privacy.html",
    images: ["https://taskpop.asmlab.agency/assets/og-image.png?v=1.10"],
  },
};

export default function PrivacyPage() {
  const html = fs.readFileSync(path.join(process.cwd(), "content/privacy.html"), "utf8");
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Boot />
    </>
  );
}
