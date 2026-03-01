import type { Metadata } from "next";
import { getSubcategories, getProductCount } from "@/lib/queries";
import { SearchBar } from "@/components/search-bar";
import { MobileMenu } from "@/components/mobile-menu";
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
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
            {/* Logo */}
            <a href="/" className="flex items-center gap-3 shrink-0">
              <div className="h-10 w-10 rounded bg-[#4a5c3a] flex items-center justify-center font-black text-white text-lg tracking-tighter border border-[#5a6c4a]">
                N
              </div>
              <div>
                <h1 className="text-lg font-black tracking-[0.08em] text-white uppercase">NEKNEKS</h1>
                <p className="text-[9px] uppercase tracking-[0.4em] text-[#4a5c3a] font-semibold">Airsoft Supply</p>
              </div>
            </a>

            {/* Search (desktop) */}
            <div className="hidden md:block flex-1 max-w-md">
              <SearchBar />
            </div>

            {/* Nav */}
            <nav className="hidden md:flex items-center gap-1 text-sm">
              {subcategories.filter(s => s.productCount > 0).slice(0, 5).map((sc) => (
                <a
                  key={sc.id}
                  href={`/category/${sc.slug}`}
                  className="px-3 py-1.5 rounded text-[#888] hover:text-[#c8b88a] hover:bg-[#141414] transition-colors text-xs font-medium uppercase tracking-wider"
                >
                  {sc.name.replace(' Rifles', '').replace(' Pistols', '')}
                </a>
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
        <footer className="border-t border-[#1a1a1a] mt-16 camo-stripe">
          <div className="mx-auto max-w-7xl px-4 py-10">
            <div className="grid md:grid-cols-3 gap-8">
              <div>
                <h3 className="font-black text-white uppercase tracking-wider text-sm mb-3">NekNeks Airsoft</h3>
                <p className="text-xs text-[#555] leading-relaxed">
                  Your trusted airsoft gear provider in the Philippines. {totalCount}+ products across rifles, pistols, and tactical gear.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-[#888] uppercase tracking-wider text-xs mb-3">Categories</h3>
                <ul className="space-y-1.5">
                  {subcategories.filter(s => s.productCount > 0).map((sc) => (
                    <li key={sc.id}>
                      <a href={`/category/${sc.slug}`} className="text-xs text-[#555] hover:text-[#c8b88a] transition-colors">
                        {sc.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-[#888] uppercase tracking-wider text-xs mb-3">Contact</h3>
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
