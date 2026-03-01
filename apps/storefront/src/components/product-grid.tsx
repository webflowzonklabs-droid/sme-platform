import type { Product } from "@/lib/queries";
import Image from "next/image";

export function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#444]">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 text-[#333]">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p className="text-sm">No products found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {products.map((p) => {
        const inStock = p.stockStatus === "in_stock";
        return (
          <a
            key={p.id}
            href={`/product/${p.slug}`}
            className="product-card group rounded-lg bg-[#111] border border-[#1a1a1a] overflow-hidden relative"
          >
            {/* Image */}
            <div className="relative aspect-square bg-[#0c0c0c] overflow-hidden">
              {p.photoUrl ? (
                <Image
                  src={p.photoUrl}
                  alt={p.photoAlt || p.name}
                  fill
                  className="product-img object-contain p-3 transition-transform duration-300"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  loading="lazy"
                  unoptimized
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[#222] text-xs">
                  No image
                </div>
              )}

              {/* OOS ribbon */}
              {!inStock && <div className="oos-ribbon">Out of Stock</div>}

              {/* NEW badge */}
              {p.isNew && inStock && (
                <div className="absolute top-2 left-2 bg-[#4a5c3a] text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                  New
                </div>
              )}

              {/* Price overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <div className="inline-block bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded">
                  <span className="text-sm font-bold text-[#c8b88a]">
                    ₱{Number(p.price).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* View Details hover */}
              <div className="view-btn absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                <span className="px-4 py-2 bg-[#4a5c3a] text-white text-[10px] font-bold uppercase tracking-wider rounded border border-[#5a6c4a]">
                  View Details
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="p-3">
              {p.brand && (
                <p className="text-[9px] uppercase tracking-[0.15em] text-[#4a5c3a] font-semibold mb-0.5">
                  {p.brand}
                </p>
              )}
              <h3 className="text-xs font-medium leading-tight line-clamp-2 text-[#999] group-hover:text-white transition-colors">
                {p.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-green-500" : "bg-red-500"}`}
                />
                <span className={`text-[9px] uppercase tracking-wider font-medium ${inStock ? "text-green-500/70" : "text-red-500/70"}`}>
                  {inStock ? "In Stock" : "OOS"}
                </span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
