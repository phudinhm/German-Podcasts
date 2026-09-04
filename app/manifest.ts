import type { MetadataRoute } from "next";

/**
 * The install manifest.
 *
 * Without it "install as app" produced a window with a blank or letter icon:
 * a favicon is not enough, browsers want declared install icons at known sizes.
 * The icons are rendered from the same source SVG as the favicon, so the
 * installed app and the tab always agree.
 *
 * "maskable" is a separate entry rather than a second purpose on the same file
 * because a launcher that crops to a circle would otherwise clip the corners of
 * the rounded plate. That version puts the glyph inside the central safe zone
 * and lets the background bleed to the edge.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hörbar - podcasts, and where you left off",
    short_name: "Hörbar",
    description:
      "Find podcasts on Apple Podcasts, Spotify or any RSS feed, follow the shows you like, and pick up every episode where you left it.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#1a1815",
    theme_color: "#1a1815",
    categories: ["education", "news", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Your library", short_name: "Library", url: "/library" },
    ],
  };
}
