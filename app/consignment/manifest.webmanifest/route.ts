export function GET() {
  return Response.json({
    background_color: "#09090b",
    description: "Consignment order and stock tracker for Siomai.",
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
    name: "Siomai Consignment",
    orientation: "portrait",
    scope: "/consignment",
    short_name: "Consignment",
    start_url: "/consignment",
    theme_color: "#6ee7b7",
  });
}
