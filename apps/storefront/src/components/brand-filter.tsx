"use client";

export function BrandFilter({
  brands,
  activeBrand,
  activeStock,
  categorySlug,
}: {
  brands: { brand: string; count: number }[];
  activeBrand: string | null;
  activeStock: string | null;
  categorySlug: string;
}) {
  function buildUrl(brand?: string, stock?: string) {
    const params = new URLSearchParams();
    if (brand) params.set("brand", brand);
    if (stock) params.set("stock", stock);
    const qs = params.toString();
    return `/category/${categorySlug}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mb-6 space-y-3">
      {/* Stock toggle */}
      <div className="flex items-center gap-2">
        <a
          href={buildUrl(activeBrand || undefined, undefined)}
          className={`brand-pill px-3 py-1.5 rounded border text-[10px] font-bold uppercase tracking-wider ${
            !activeStock ? "active" : "border-[#1e1e1e] text-[#555]"
          }`}
        >
          All
        </a>
        <a
          href={buildUrl(activeBrand || undefined, "in_stock")}
          className={`brand-pill px-3 py-1.5 rounded border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            activeStock === "in_stock"
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "border-[#1e1e1e] text-[#555]"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          In Stock
        </a>
      </div>

      {/* Brand pills */}
      <div className="flex flex-wrap gap-1.5">
        {activeBrand && (
          <a
            href={buildUrl(undefined, activeStock || undefined)}
            className="brand-pill px-3 py-1.5 rounded border border-[#1e1e1e] text-[10px] font-bold uppercase tracking-wider text-[#888] hover:text-white"
          >
            ✕ Clear
          </a>
        )}
        {brands.map((b) => (
          <a
            key={b.brand}
            href={buildUrl(b.brand, activeStock || undefined)}
            className={`brand-pill px-3 py-1.5 rounded border text-[10px] font-bold uppercase tracking-wider ${
              activeBrand === b.brand ? "active" : "border-[#1e1e1e] text-[#555]"
            }`}
          >
            {b.brand} <span className="text-[#333] ml-1">{b.count}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
