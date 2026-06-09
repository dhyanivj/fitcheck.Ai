import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FitCheck.AI - Virtual Fitting Room & AI Try-On",
  description: "Experience the ultimate AI virtual try-on fitting room. Paste a clothing link from any online store, upload your photo, and instantly see how you look in the outfit.",
  keywords: [
    "FitCheck",
    "AI Try-On",
    "Virtual Fitting Room",
    "AI Fashion Assistant",
    "Virtual Dressing Room",
    "Try On Clothes Online",
    "AI Clothes Changer",
    "Outfit Visualizer",
    "Vijay Dhyani"
  ],
  authors: [{ name: "Vijay Dhyani", url: "https://dhyani.site" }],
  creator: "Vijay Dhyani",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://fitcheck.ai",
    title: "FitCheck.AI - See How Any Clothing Looks On You Instantly",
    description: "Try on clothes virtually using AI. Paste a product URL from your favorite store and upload your photo to preview the fit instantly.",
    siteName: "FitCheck.AI",
    images: [
      {
        url: "/og-image.png",
        width: 1024,
        height: 1024,
        alt: "FitCheck.AI - Virtual Fitting Room & AI Try-On Logo & Dashboard Preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FitCheck.AI - Virtual Fitting Room & AI Try-On",
    description: "Try on clothes virtually using AI. Paste a product URL and upload your photo to preview the fit instantly.",
    images: ["/og-image.png"],
    creator: "@vijaydhyani",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
