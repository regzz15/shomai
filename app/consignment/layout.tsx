import type { Metadata } from "next";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Siomai Consignment",
  },
  description: "Consignment order and stock tracker for Siomai.",
  manifest: "/consignment/manifest.webmanifest",
  title: "Siomai Consignment",
};

export default function ConsignmentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
