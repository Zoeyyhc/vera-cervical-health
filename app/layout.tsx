import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


// Camera Plain Variable — place the licensed font file at app/fonts/CameraPlainVariable.otf
// (or .woff2). Replace the placeholder src when the real font is available.
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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="bg-cream text-charcoal font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
