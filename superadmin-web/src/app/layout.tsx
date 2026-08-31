import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ZestHealth Super-Admin Panel",
  description: "Platform management for ZestHealth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-blue-600">ZestHealth Super-Admin</h1>
            <nav className="space-x-4">
              <Link href="/" className="text-gray-600 hover:text-blue-600">Dashboard</Link>
              <Link href="/onboard" className="text-gray-600 hover:text-blue-600">Onboard Tenant</Link>
            </nav>
          </header>
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
