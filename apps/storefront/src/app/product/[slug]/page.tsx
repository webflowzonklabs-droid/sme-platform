import { getProduct } from "@/lib/queries";
import { notFound } from "next/navigation";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <a href="/" className="text-sm text-[#888] hover:text-[#d4a24e] transition-colors mb-6 inline-block">
        ← Back to shop
      </a>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Photo */}
        <div className="relative aspect-square rounded-xl overflow-hidden bg-[#141414] border border-[#2a2a2a]">
          {product.photoUrl ? (
            <Image
              src={product.photoUrl}
              alt={product.photoAlt || product.name}
              fill
              className="object-contain p-4"
              sizes="(max-width: 768px) 100vw, 50vw"
              unoptimized
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#555]">No image</div>
          )}
          {!inStock && (
            <div className="absolute top-4 right-4 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
              OUT OF STOCK
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {product.subcategoryName && (
            <p className="text-xs uppercase tracking-wider text-[#d4a24e] mb-2">
              {product.subcategoryName}
            </p>
          )}

          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>

          {product.brand && (
            <p className="text-sm text-[#888] mb-4">Brand: {product.brand}</p>
          )}

          <div className="flex items-center gap-4 mb-6">
            <span className="text-3xl font-bold text-[#d4a24e]">
              ₱{Number(product.price).toLocaleString()}
            </span>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${
                inStock
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {inStock ? "IN STOCK" : "OUT OF STOCK"}
            </span>
          </div>

          <div className="border-t border-[#2a2a2a] pt-6 mt-6">
            <h3 className="text-sm font-semibold text-[#888] uppercase tracking-wider mb-3">
              Product Details
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#888]">Category</dt>
                <dd>{product.categoryName}</dd>
              </div>
              {product.subcategoryName && (
                <div className="flex justify-between">
                  <dt className="text-[#888]">Type</dt>
                  <dd>{product.subcategoryName}</dd>
                </div>
              )}
              {product.brand && (
                <div className="flex justify-between">
                  <dt className="text-[#888]">Brand</dt>
                  <dd>{product.brand}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="mt-8 p-4 rounded-lg bg-[#141414] border border-[#2a2a2a]">
            <p className="text-sm text-[#888]">
              📍 Visit our shop or message us on social media to order!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
