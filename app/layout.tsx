import type { Metadata } from "next";
import "./globals.css";

// Camera Plain Variable font is not yet licensed.
// Using ui-sans-serif / system-ui fallback until the real font file is available.
// To restore: add the licensed CameraPlainVariable.otf to app/fonts/ and re-enable localFont.

export const metadata: Metadata = {
  title: "Cervix Health Assistant",
  description: "Cervical health education and AI-powered Q&A assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-cream text-charcoal font-sans antialiased">{children}</body>
    </html>
  );
}
