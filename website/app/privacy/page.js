import fs from "fs";
import path from "path";
import Boot from "../boot";

export const metadata = {
  title: "Privacy – TaskPop",
  description: "TaskPop keeps your tasks on your computer. No account, no tracking, no ads.",
  alternates: { canonical: "https://taskpop.asmlab.agency/privacy.html" },
  openGraph: {
    title: "Privacy – TaskPop",
    description: "TaskPop keeps your tasks on your computer. No account, no tracking, no ads.",
    url: "https://taskpop.asmlab.agency/privacy.html",
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
