import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Camera Plain Variable — place the licensed font file at app/fonts/CameraPlainVariable.otf
// (or .woff2). The current file is a placeholder; replace with the real font when licensed.
// No Google Fonts — ui-sans-serif / system-ui are the fallback chain.
const cameraPlain = localFont({
  src: "./fonts/CameraPlainVariable.otf",
  variable: "--font-camera",
  fallback: ["ui-sans-serif", "system-ui"],
  display: "swap",
});

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
    <html lang="en" className={cameraPlain.variable}>
      <body className="bg-cream text-charcoal font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
