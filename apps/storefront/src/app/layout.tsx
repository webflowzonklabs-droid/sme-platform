import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NekNeks Airsoft Shop",
  description: "Your trusted airsoft gear provider in the Philippines",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-[#0a0a0a]/95 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#d4a24e] flex items-center justify-center font-bold text-black text-lg">
                N
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">NEKNEKS</h1>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#888]">Airsoft Shop</p>
              </div>
            </a>
            <nav className="hidden md:flex items-center gap-6 text-sm text-[#888]">
              <a href="/" className="hover:text-white transition-colors">Shop</a>
              <a href="/?stock=in_stock" className="hover:text-white transition-colors">In Stock</a>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        {/* Footer */}
        <footer className="border-t border-[#2a2a2a] mt-16 py-8">
          <div className="mx-auto max-w-7xl px-4 text-center text-sm text-[#555]">
            <p>© 2024 NekNeks Airsoft Shop. All rights reserved.</p>
            <p className="mt-1">Powered by SME Platform</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
