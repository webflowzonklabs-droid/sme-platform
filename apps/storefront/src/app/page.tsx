import { getSubcategoriesWithPhotos, getProductCount, getProducts } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const subcategories = await getSubcategoriesWithPhotos();
  const totalCount = await getProductCount();
  const featuredProducts = await getProducts({ stockFilter: "in_stock", limit: 8 });

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#1a1a1a]">
        <div className="absolute inset-0 camo-stripe" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-px bg-[#4a5c3a]" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#4a5c3a] font-bold">
                Tactical Airsoft Supply
              </span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white uppercase leading-[0.95]">
              Gear Up.<br />
              <span className="text-[#4a5c3a]">Dominate</span> the Field.
            </h2>
            <p className="mt-4 text-sm text-[#666] max-w-md leading-relaxed">
              {totalCount}+ airsoft products. HPA Rifles, AEGs, GBB Pistols, Snipers — everything you need to own the game.
            </p>
            <div className="mt-6 flex gap-3">
              <a
                href="#categories"
                className="px-5 py-2.5 bg-[#4a5c3a] text-white text-xs font-bold uppercase tracking-wider rounded hover:bg-[#5a6c4a] transition-colors border border-[#5a6c4a]"
              >
                Browse Catalog
              </a>
              <a
                href="/?stock=in_stock"
                className="px-5 py-2.5 bg-transparent text-[#888] text-xs font-bold uppercase tracking-wider rounded hover:text-white transition-colors border border-[#2a2a2a] hover:border-[#444]"
              >
                In Stock Only
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-3 gap-4 max-w-md">
            <div>
              <div className="text-2xl font-black text-white">{totalCount}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#555]">Products</div>
            </div>
            <div>
              <div className="text-2xl font-black text-white">{subcategories.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#555]">Categories</div>
            </div>
            <div>
              <div className="text-2xl font-black text-white">60+</div>
              <div className="text-[10px] uppercase tracking-wider text-[#555]">Brands</div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Cards */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-12 md:py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-6 h-px bg-[#4a5c3a]" />
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#888]">Shop by Category</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {subcategories.map((sc) => (
            <a
              key={sc.id}
              href={`/category/${sc.slug}`}
              className="category-card group relative rounded-lg overflow-hidden bg-[#111] border border-[#1a1a1a] hover:border-[#4a5c3a]/40"
            >
              {/* Image */}
              <div className="relative aspect-[4/3] bg-[#0e0e0e] overflow-hidden">
                {sc.photoUrl ? (
                  <Image
                    src={sc.photoUrl}
                    alt={sc.name}
                    fill
                    className="category-img object-contain p-4 transition-transform duration-500"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-[#333]">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v8M8 12h8" />
                    </svg>
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent" />
              </div>

              {/* Info */}
              <div className="p-3 pb-4">
                <h3 className="text-sm font-bold text-white group-hover:text-[#c8b88a] transition-colors uppercase tracking-wide">
                  {sc.name}
                </h3>
                <p className="text-[11px] text-[#555] mt-0.5">
                  {sc.productCount} product{sc.productCount !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#4a5c3a]/30 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      </section>

      {/* Featured / In Stock */}
      {featuredProducts.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12 md:pb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-px bg-[#4a5c3a]" />
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#888]">Available Now</h2>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            <a href="/?stock=in_stock" className="text-xs text-[#555] hover:text-[#c8b88a] transition-colors uppercase tracking-wider">
              View All →
            </a>
          </div>
          <ProductGrid products={featuredProducts} />
        </section>
      )}
    </div>
  );
}
