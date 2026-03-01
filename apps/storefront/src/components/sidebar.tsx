import type { Subcategory } from "@/lib/queries";

export function Sidebar({
  subcategories,
  activeCategory,
  activeStock,
}: {
  subcategories: Subcategory[];
  activeCategory: string | null;
  activeStock: string | null;
}) {
  return (
    <aside className="hidden md:block w-56 shrink-0">
      <div className="sticky top-24">
        {/* Categories */}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#888] mb-3">
          Categories
        </h3>
        <ul className="space-y-1 mb-6">
          <li>
            <a
              href="/"
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                !activeCategory
                  ? "bg-[#d4a24e]/10 text-[#d4a24e] font-medium"
                  : "text-[#888] hover:text-white hover:bg-[#141414]"
              }`}
            >
              All Products
            </a>
          </li>
          {subcategories.map((sc) => (
            <li key={sc.id}>
              <a
                href={`/?category=${sc.slug}`}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeCategory === sc.slug
                    ? "bg-[#d4a24e]/10 text-[#d4a24e] font-medium"
                    : "text-[#888] hover:text-white hover:bg-[#141414]"
                }`}
              >
                <span>{sc.name}</span>
                <span className="text-xs text-[#555]">{sc.productCount}</span>
              </a>
            </li>
          ))}
        </ul>

        {/* Stock Filter */}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#888] mb-3">
          Availability
        </h3>
        <ul className="space-y-1">
          <li>
            <a
              href={activeCategory ? `/?category=${activeCategory}` : "/"}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                !activeStock
                  ? "bg-[#d4a24e]/10 text-[#d4a24e] font-medium"
                  : "text-[#888] hover:text-white hover:bg-[#141414]"
              }`}
            >
              All
            </a>
          </li>
          <li>
            <a
              href={`/?${activeCategory ? `category=${activeCategory}&` : ""}stock=in_stock`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeStock === "in_stock"
                  ? "bg-green-500/10 text-green-400 font-medium"
                  : "text-[#888] hover:text-white hover:bg-[#141414]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-green-500" />
              In Stock
            </a>
          </li>
          <li>
            <a
              href={`/?${activeCategory ? `category=${activeCategory}&` : ""}stock=out_of_stock`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeStock === "out_of_stock"
                  ? "bg-red-500/10 text-red-400 font-medium"
                  : "text-[#888] hover:text-white hover:bg-[#141414]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Out of Stock
            </a>
          </li>
        </ul>
      </div>
    </aside>
  );
}
