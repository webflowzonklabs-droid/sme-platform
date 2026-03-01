import type { Product } from "@/lib/queries";
import Image from "next/image";

export function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) {
    return (
      <div className="flex items-center justify-center py-20 text-[#555]">
        <p>No products found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p) => {
        const inStock = p.stockStatus === "in_stock";
        return (
          <a
            key={p.id}
            href={`/product/${p.slug}`}
            className="group rounded-xl bg-[#141414] border border-[#2a2a2a] overflow-hidden hover:border-[#d4a24e]/30 transition-all duration-200 hover:shadow-lg hover:shadow-[#d4a24e]/5"
          >
            {/* Image */}
            <div className="relative aspect-square bg-[#0e0e0e]">
              {p.photoUrl ? (
                <Image
                  src={p.photoUrl}
                  alt={p.photoAlt || p.name}
                  fill
                  className="object-contain p-3 group-hover:scale-105 transition-transform duration-200"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  unoptimized
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[#333] text-xs">
                  No image
                </div>
              )}
              {!inStock && (
                <div className="absolute top-2 right-2 bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  OOS
                </div>
              )}
              {p.isNew && inStock && (
                <div className="absolute top-2 left-2 bg-[#d4a24e] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                  NEW
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-3">
              {p.brand && (
                <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">
                  {p.brand}
                </p>
              )}
              <h3 className="text-sm font-medium leading-tight line-clamp-2 mb-2 group-hover:text-[#d4a24e] transition-colors">
                {p.name}
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#d4a24e]">
                  ₱{Number(p.price).toLocaleString()}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    inStock ? "bg-green-500" : "bg-red-500"
                  }`}
                  title={inStock ? "In Stock" : "Out of Stock"}
                />
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
