import Link from "next/link";
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
        <h3 className="text-xs font-black uppercase tracking-wider text-[#F5A623] mb-3">
          Categories
        </h3>
        <ul className="space-y-1 mb-6">
          <li>
            <Link
              href="/"
              className={`block px-3 py-2 rounded-lg text-sm transition-colors font-medium uppercase ${
                !activeCategory
                  ? "bg-[#F5A623]/10 text-[#F5A623]"
                  : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              All Products
            </Link>
          </li>
          {subcategories.map((sc) => (
            <li key={sc.id}>
              <Link
                href={`/?category=${sc.slug}`}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeCategory === sc.slug
                    ? "bg-[#F5A623]/10 text-[#F5A623] font-bold"
                    : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                <span>{sc.name}</span>
                <span className="text-xs text-[#555]">{sc.productCount}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Stock Filter */}
        <h3 className="text-xs font-black uppercase tracking-wider text-[#F5A623] mb-3">
          Availability
        </h3>
        <ul className="space-y-1">
          <li>
            <Link
              href={activeCategory ? `/?category=${activeCategory}` : "/"}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors font-medium ${
                !activeStock
                  ? "bg-[#F5A623]/10 text-[#F5A623]"
                  : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              All
            </Link>
          </li>
          <li>
            <Link
              href={`/?${activeCategory ? `category=${activeCategory}&` : ""}stock=in_stock`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeStock === "in_stock"
                  ? "bg-green-500/10 text-green-400 font-bold"
                  : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-green-500" />
              In Stock
            </Link>
          </li>
          <li>
            <Link
              href={`/?${activeCategory ? `category=${activeCategory}&` : ""}stock=out_of_stock`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeStock === "out_of_stock"
                  ? "bg-red-500/10 text-red-400 font-bold"
                  : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Out of Stock
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}
