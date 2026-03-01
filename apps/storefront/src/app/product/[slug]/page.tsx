import { getProduct, getRelatedProducts } from "@/lib/queries";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/product-grid";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const inStock = product.stockStatus === "in_stock";
  const related = product.subcategorySlug
    ? await getRelatedProducts(product.subcategorySlug, slug, 8)
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#555] mb-6">
        <a href="/" className="hover:text-[#c8b88a] transition-colors">Home</a>
        {product.subcategorySlug && (
          <>
            <span className="text-[#333]">/</span>
            <a href={`/category/${product.subcategorySlug}`} className="hover:text-[#c8b88a] transition-colors">
              {product.subcategoryName}
            </a>
          </>
        )}
        {product.brand && (
          <>
            <span className="text-[#333]">/</span>
            <a
              href={`/category/${product.subcategorySlug}?brand=${encodeURIComponent(product.brand)}`}
              className="hover:text-[#c8b88a] transition-colors"
            >
              {product.brand}
            </a>
          </>
        )}
        <span className="text-[#333]">/</span>
        <span className="text-[#888] truncate max-w-[200px]">{product.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-6 md:gap-10">
        {/* Photo */}
        <div className="relative aspect-square rounded-lg overflow-hidden bg-[#0e0e0e] border border-[#1a1a1a]">
          {product.photoUrl ? (
            <Image
              src={product.photoUrl}
              alt={product.photoAlt || product.name}
              fill
              className="object-contain p-6"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
              unoptimized
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#333]">No image</div>
          )}
          {!inStock && (
            <div className="absolute top-4 left-4 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider">
              Out of Stock
            </div>
          )}
          {product.isNew && inStock && (
            <div className="absolute top-4 left-4 bg-[#4a5c3a] text-white text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider">
              New
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {product.brand && (
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#4a5c3a] font-bold mb-2">
              {product.brand}
            </p>
          )}

          <h1 className="text-xl md:text-2xl font-black text-white leading-tight mb-4">
            {product.name}
          </h1>

          <div className="flex items-center gap-4 mb-6">
            <span className="text-3xl font-black text-[#c8b88a]">
              ₱{Number(product.price).toLocaleString()}
            </span>
            <span
              className={`text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider ${
                inStock
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {inStock ? "In Stock" : "Out of Stock"}
            </span>
          </div>

          {/* Details table */}
          <div className="border-t border-[#1a1a1a] pt-5 mt-5">
            <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-[0.2em] mb-3">
              Specifications
            </h3>
            <dl className="space-y-2.5 text-sm">
              {product.categoryName && (
                <div className="flex justify-between">
                  <dt className="text-[#555] text-xs">Category</dt>
                  <dd className="text-xs text-[#999]">{product.categoryName}</dd>
                </div>
              )}
              {product.subcategoryName && (
                <div className="flex justify-between">
                  <dt className="text-[#555] text-xs">Type</dt>
                  <dd className="text-xs text-[#999]">{product.subcategoryName}</dd>
                </div>
              )}
              {product.brand && (
                <div className="flex justify-between">
                  <dt className="text-[#555] text-xs">Brand</dt>
                  <dd className="text-xs text-[#999]">{product.brand}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[#555] text-xs">Availability</dt>
                <dd className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-green-500" : "bg-red-500"}`} />
                  <span className={`text-xs ${inStock ? "text-green-400" : "text-red-400"}`}>
                    {inStock ? "In Stock" : "Out of Stock"}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* CTA */}
          <div className="mt-6 p-4 rounded-lg bg-[#111] border border-[#1a1a1a]">
            <p className="text-xs text-[#666]">
              📍 Visit our shop or message us on social media to order!
            </p>
          </div>
        </div>
      </div>

      {/* Related products */}
      {related.length > 0 && (
        <section className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-4 h-px bg-[#4a5c3a]" />
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#888]">
              Related Products
            </h2>
          </div>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
