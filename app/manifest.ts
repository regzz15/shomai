import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#09090b",
    description: "Production, stock, release, and payment tracker for Shomai.",
    display: "standalone",
    icons: [
      {
        purpose: "any",
        sizes: "any",
        src: "/icon.svg",
        type: "image/svg+xml",
      },
      {
        purpose: "maskable",
        sizes: "any",
        src: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    name: "Shomai Production",
    orientation: "portrait",
    scope: "/",
    short_name: "Shomai",
    start_url: "/",
    theme_color: "#6ee7b7",
  };
}
