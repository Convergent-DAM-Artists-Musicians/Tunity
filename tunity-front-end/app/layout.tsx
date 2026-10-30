import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tunity — Your practice, in tune",
  description: "Your recordings, practice projects, and musical feedback.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <html lang="en"><body>{children}</body></html>;
}
