import { getProducts, getSubcategories, getProductCount } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import { Sidebar } from "@/components/sidebar";
import { SearchBar } from "@/components/search-bar";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string; stock?: string; page?: string }>;
}) {
  const params = await searchParams;
  const subcategories = await getSubcategories();
  const totalCount = await getProductCount();

  const page = parseInt(params.page || "1");
  const limit = 48;
  const offset = (page - 1) * limit;

  const products = await getProducts({
    subcategorySlug: params.category,
    search: params.search,
    stockFilter: params.stock,
    limit,
    offset,
  });

  const activeCategory = params.category || null;
  const searchQuery = params.search || "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <div className="mb-8 rounded-xl bg-gradient-to-r from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] p-8">
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome to <span className="text-[#d4a24e]">NekNeks</span>
        </h2>
        <p className="mt-2 text-[#888]">
          {totalCount} airsoft products • Rifles, Pistols, Snipers & More
        </p>
        <div className="mt-4 max-w-md">
          <SearchBar defaultValue={searchQuery} />
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <Sidebar
          subcategories={subcategories}
          activeCategory={activeCategory}
          activeStock={params.stock || null}
        />

        {/* Products */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-[#888]">
              {products.length} product{products.length !== 1 ? "s" : ""}
              {activeCategory ? ` in ${subcategories.find(s => s.slug === activeCategory)?.name || activeCategory}` : ""}
              {searchQuery ? ` matching "${searchQuery}"` : ""}
            </p>
          </div>

          <ProductGrid products={products} />

          {/* Pagination */}
          {products.length === limit && (
            <div className="mt-8 flex justify-center gap-2">
              {page > 1 && (
                <a
                  href={`?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
                  className="px-4 py-2 rounded-lg bg-[#141414] border border-[#2a2a2a] text-sm hover:bg-[#1a1a1a] transition-colors"
                >
                  ← Previous
                </a>
              )}
              <a
                href={`?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
                className="px-4 py-2 rounded-lg bg-[#141414] border border-[#2a2a2a] text-sm hover:bg-[#1a1a1a] transition-colors"
              >
                Next →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
