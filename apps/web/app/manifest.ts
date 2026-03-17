import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ভাড়া কত — Vara Koto",
    short_name: "ভাড়া কত",
    description:
      "BRTA অনুমোদিত বাস ভাড়া ক্যালকুলেটর। Calculate exact bus fares for Dhaka using official BRTA rates.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1a4a8e",
    categories: ["travel", "utilities"],
    lang: "bn",
    dir: "ltr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    shortcuts: [
      {
        name: "ভাড়া হিসাব করুন",
        short_name: "ভাড়া",
        description: "Calculate bus fare",
        url: "/",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "সাম্প্রতিক অনুসন্ধান",
        short_name: "ইতিহাস",
        description: "Recent fare searches",
        url: "/history",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
