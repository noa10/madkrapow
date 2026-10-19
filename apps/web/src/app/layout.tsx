import type { Metadata } from "next";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./globals.css";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { InAppHistoryTracker } from "@/components/layout/InAppHistoryTracker";
import { ToastContainer } from "@/components/ui/ToastContainer";

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
      <body className="font-body antialiased">
        <InAppHistoryTracker />
        {children}
        <CartDrawer />
        <ToastContainer />
      </body>
    </html>
  );
}
