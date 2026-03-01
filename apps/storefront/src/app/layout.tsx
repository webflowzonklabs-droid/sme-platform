import type { Metadata } from "next";
import { getSubcategories, getProductCount } from "@/lib/queries";
import { SearchBar } from "@/components/search-bar";
import { MobileMenu } from "@/components/mobile-menu";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NekNeks Airsoft — Tactical Gear & Airsoft Guns",
  description: "Your trusted airsoft gear provider in the Philippines. HPA Rifles, AEG, GBB Pistols, Snipers & More.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const subcategories = await getSubcategories();
  const totalCount = await getProductCount();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/97 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <Image
                src="/nekneks-logo.jpg"
                alt="NekNeks Airsoft"
                width={44}
                height={44}
                className="rounded"
                unoptimized
              />
              <div>
                <h1 className="text-lg font-black tracking-[0.08em] text-white uppercase">NEKNEKS</h1>
                <p className="text-[9px] uppercase tracking-[0.4em] text-[#F5A623] font-semibold">Airsoft Shop</p>
              </div>
            </Link>

            {/* Search (desktop) */}
            <div className="hidden md:block flex-1 max-w-md">
              <SearchBar />
            </div>

            {/* Nav */}
            <nav className="hidden md:flex items-center gap-1 text-sm">
              {subcategories.filter(s => s.productCount > 0).slice(0, 5).map((sc) => (
                <Link
                  key={sc.id}
                  href={`/category/${sc.slug}`}
                  className="px-3 py-1.5 rounded text-[#888] hover:text-[#F5A623] hover:bg-[#1a1a1a] transition-colors text-xs font-bold uppercase tracking-wider"
                >
                  {sc.name.replace(' Rifles', '').replace(' Pistols', '')}
                </Link>
              ))}
            </nav>

            {/* Mobile menu toggle */}
            <MobileMenu subcategories={subcategories} />
          </div>

          {/* Mobile search */}
          <div className="md:hidden px-4 pb-3">
            <SearchBar />
          </div>
        </header>

        <main>{children}</main>

        {/* Footer */}
        <footer className="border-t border-[#1a1a1a] mt-16 concrete-bg">
          <div className="mx-auto max-w-7xl px-4 py-10">
            <div className="grid md:grid-cols-3 gap-8">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Image
                    src="/nekneks-logo.jpg"
                    alt="NekNeks Airsoft"
                    width={36}
                    height={36}
                    className="rounded"
                    unoptimized
                  />
                  <h3 className="font-black text-white uppercase tracking-wider text-sm">NekNeks Airsoft</h3>
                </div>
                <p className="text-xs text-[#555] leading-relaxed">
                  Your trusted airsoft gear provider in the Philippines. {totalCount}+ products across rifles, pistols, and tactical gear.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-[#F5A623] uppercase tracking-wider text-xs mb-3">Categories</h3>
                <ul className="space-y-1.5">
                  {subcategories.filter(s => s.productCount > 0).map((sc) => (
                    <li key={sc.id}>
                      <Link href={`/category/${sc.slug}`} className="text-xs text-[#555] hover:text-[#F5A623] transition-colors">
                        {sc.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-[#F5A623] uppercase tracking-wider text-xs mb-3">Contact</h3>
                <p className="text-xs text-[#555]">📍 Visit our shop or message us on social media to order!</p>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-[#1a1a1a] text-center text-[10px] text-[#333] uppercase tracking-widest">
              © 2024 NekNeks Airsoft. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
