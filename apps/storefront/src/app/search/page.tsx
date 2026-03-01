import { getProducts } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stock?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q || "";
  const page = parseInt(sp.page || "1");
  const limit = 48;
  const offset = (page - 1) * limit;

  const products = query
    ? await getProducts({ search: query, stockFilter: sp.stock, limit, offset })
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#555] mb-6">
        <a href="/" className="hover:text-[#F5A623] transition-colors">Home</a>
        <span className="text-[#333]">/</span>
        <span className="text-[#888]">Search</span>
      </nav>

      <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-1">
        Search Results
      </h1>
      <p className="text-xs text-[#555] mb-6">
        {products.length} result{products.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
      </p>

      <ProductGrid products={products} />

      {products.length === limit && (
        <div className="mt-8 flex justify-center">
          <a
            href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`}
            className="px-4 py-2 rounded bg-[#111] border border-[#1a1a1a] text-xs hover:border-[#F5A623]/30 hover:text-[#F5A623] transition-colors text-[#888] font-bold uppercase"
          >
            Next →
          </a>
        </div>
      )}
    </div>
  );
}
