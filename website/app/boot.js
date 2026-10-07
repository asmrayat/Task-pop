"use client";

import { useEffect } from "react";
import { startSite } from "../lib/site";

export default function Boot() {
  useEffect(() => {
    startSite();
  }, []);
  return null;
}
