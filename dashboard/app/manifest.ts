import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NurAi: AI reply drafts for X",
    short_name: "NurAi",
    description:
      "Human-in-the-loop reply drafts for X. Four context-aware options per post, reviewed and published by you.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdfbf7",
    theme_color: "#fdfbf7",
    lang: "en",
    categories: ["productivity", "social"],
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      }
    ]
  };
}
