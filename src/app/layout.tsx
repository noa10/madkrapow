import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { CartDrawer } from "@/components/cart/CartDrawer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cormorant",
});

export const metadata: Metadata = {
  title: "Mad Krapow - Thai Street Food",
  description:
    "Order your favorite Thai street food directly from Mad Krapow",
  icons: {
    icon: "/madkrapow-logo.png",
    apple: "/madkrapow-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${cormorantGaramond.variable} font-body antialiased`}
      >
        {children}
        <CartDrawer />
      </body>
    </html>
  );
}
