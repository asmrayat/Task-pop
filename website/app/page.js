import fs from "fs";
import path from "path";
import Boot from "./boot";

export const metadata = {
  alternates: { canonical: "https://taskpop.asmlab.agency/" },
};

export default function HomePage() {
  const html = fs.readFileSync(path.join(process.cwd(), "content/home.html"), "utf8");
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Boot />
    </>
  );
}
