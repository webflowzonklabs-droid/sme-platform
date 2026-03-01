import { getProducts, getSubcategories, getBrandsForSubcategory } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import { BrandFilter } from "@/components/brand-filter";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ brand?: string; stock?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const subcategories = await getSubcategories();
  const current = subcategories.find((s) => s.slug === slug);
  if (!current) notFound();

  const brands = await getBrandsForSubcategory(slug);
  const page = parseInt(sp.page || "1");
  const limit = 48;
  const offset = (page - 1) * limit;

  const products = await getProducts({
    subcategorySlug: slug,
    brand: sp.brand,
    stockFilter: sp.stock,
    limit,
    offset,
  });

  // Group by brand if no brand filter
  const brandGroups = !sp.brand
    ? brands
        .map((b) => ({
          brand: b.brand,
          count: b.count,
          products: products.filter((p) => p.brand === b.brand),
        }))
        .filter((g) => g.products.length > 0)
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#555] mb-6">
        <a href="/" className="hover:text-[#c8b88a] transition-colors">Home</a>
        <span className="text-[#333]">/</span>
        <span className="text-[#888]">{current.name}</span>
        {sp.brand && (
          <>
            <span className="text-[#333]">/</span>
            <span className="text-[#c8b88a]">{sp.brand}</span>
          </>
        )}
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
          {current.name}
        </h1>
        <p className="text-xs text-[#555] mt-1">
          {current.productCount} product{current.productCount !== 1 ? "s" : ""}
          {sp.brand ? ` • Filtered by ${sp.brand}` : ""}
        </p>
      </div>

      {/* Brand filter pills */}
      <BrandFilter
        brands={brands}
        activeBrand={sp.brand || null}
        activeStock={sp.stock || null}
        categorySlug={slug}
      />

      {/* Products - grouped by brand or flat */}
      {brandGroups && !sp.stock ? (
        <div className="space-y-10">
          {brandGroups.map((group) => (
            <section key={group.brand}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-px bg-[#4a5c3a]" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    {group.brand}
                  </h2>
                  <span className="text-[10px] text-[#444]">{group.count}</span>
                </div>
                <a
                  href={`/category/${slug}?brand=${encodeURIComponent(group.brand)}`}
                  className="text-[10px] text-[#555] hover:text-[#c8b88a] transition-colors uppercase tracking-wider"
                >
                  View All →
                </a>
              </div>
              <ProductGrid products={group.products.slice(0, 8)} />
            </section>
          ))}
        </div>
      ) : (
        <>
          <ProductGrid products={products} />

          {/* Pagination */}
          {products.length === limit && (
            <div className="mt-8 flex justify-center gap-2">
              {page > 1 && (
                <a
                  href={`/category/${slug}?${new URLSearchParams({ ...(sp.brand ? { brand: sp.brand } : {}), ...(sp.stock ? { stock: sp.stock } : {}), page: String(page - 1) }).toString()}`}
                  className="px-4 py-2 rounded bg-[#111] border border-[#1a1a1a] text-xs hover:bg-[#181818] transition-colors text-[#888]"
                >
                  ← Previous
                </a>
              )}
              <a
                href={`/category/${slug}?${new URLSearchParams({ ...(sp.brand ? { brand: sp.brand } : {}), ...(sp.stock ? { stock: sp.stock } : {}), page: String(page + 1) }).toString()}`}
                className="px-4 py-2 rounded bg-[#111] border border-[#1a1a1a] text-xs hover:bg-[#181818] transition-colors text-[#888]"
              >
                Next →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
