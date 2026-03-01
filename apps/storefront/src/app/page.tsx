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
        <div className="absolute inset-0 concrete-bg" />
        <div className="absolute inset-0 grunge-stripe" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-16">
            {/* Logo prominent */}
            <div className="shrink-0">
              <Image
                src="/nekneks-logo.jpg"
                alt="NekNeks Airsoft"
                width={180}
                height={180}
                className="rounded-lg border-2 border-[#F5A623]/30 shadow-2xl shadow-black/50"
                unoptimized
                priority
              />
            </div>

            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-px bg-[#F5A623]" />
                <span className="text-[10px] uppercase tracking-[0.3em] text-[#F5A623] font-bold">
                  Tactical Airsoft Supply
                </span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white uppercase leading-[0.95] text-glow-gold">
                Gear Up.<br />
                <span className="text-[#F5A623]">Arm Up.</span>
              </h2>
              <p className="mt-4 text-sm text-[#666] max-w-md leading-relaxed">
                {totalCount}+ airsoft products. HPA Rifles, AEGs, GBB Pistols, Snipers — everything you need to dominate the field.
              </p>
              <div className="mt-6 flex gap-3">
                <a
                  href="#categories"
                  className="px-5 py-2.5 bg-[#F5A623] text-black text-xs font-black uppercase tracking-wider rounded hover:bg-[#FFB84D] transition-colors border border-[#F5A623]"
                >
                  Browse Catalog
                </a>
                <a
                  href="/?stock=in_stock"
                  className="px-5 py-2.5 bg-transparent text-[#888] text-xs font-bold uppercase tracking-wider rounded hover:text-[#F5A623] transition-colors border border-[#2a2a2a] hover:border-[#F5A623]/50"
                >
                  In Stock Only
                </a>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-3 gap-4 max-w-md">
            <div>
              <div className="text-2xl font-black text-[#F5A623]">{totalCount}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#555]">Products</div>
            </div>
            <div>
              <div className="text-2xl font-black text-[#F5A623]">{subcategories.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#555]">Categories</div>
            </div>
            <div>
              <div className="text-2xl font-black text-[#F5A623]">60+</div>
              <div className="text-[10px] uppercase tracking-wider text-[#555]">Brands</div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Cards */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-12 md:py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-6 h-px bg-[#F5A623]" />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#888]">Shop by Category</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {subcategories.map((sc) => (
            <a
              key={sc.id}
              href={`/category/${sc.slug}`}
              className="category-card group relative rounded-lg overflow-hidden card-concrete border border-[#1a1a1a] hover:border-[#F5A623]/40"
            >
              {/* Image */}
              <div className="relative aspect-[4/3] bg-[#0c0c0c] overflow-hidden">
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
              <div className="relative p-3 pb-4">
                <h3 className="text-sm font-black text-white group-hover:text-[#F5A623] transition-colors uppercase tracking-wide">
                  {sc.name}
                </h3>
                <p className="text-[11px] text-[#555] mt-0.5">
                  {sc.productCount} product{sc.productCount !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#F5A623]/30 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#F5A623]/30 rounded-tr opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      </section>

      {/* Featured / In Stock */}
      {featuredProducts.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-12 md:pb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-px bg-[#F5A623]" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#888]">Available Now</h2>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            <a href="/?stock=in_stock" className="text-xs text-[#555] hover:text-[#F5A623] transition-colors uppercase tracking-wider font-bold">
              View All →
            </a>
          </div>
          <ProductGrid products={featuredProducts} />
        </section>
      )}
    </div>
  );
}
