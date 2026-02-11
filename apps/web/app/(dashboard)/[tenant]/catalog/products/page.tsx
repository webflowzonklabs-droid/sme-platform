"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
} from "@sme/ui";
import { Plus, Package, Search, Trash2, Edit } from "lucide-react";
import { trpc } from "@/trpc/client";

const stockStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  in_stock: { label: "In Stock", variant: "default" },
  out_of_stock: { label: "Out of Stock", variant: "destructive" },
  pre_order: { label: "Pre-order", variant: "secondary" },
  reserved: { label: "Reserved", variant: "outline" },
};

export default function ProductsPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenant as string;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [stockFilter, setStockFilter] = useState<string>("");

  const { data: productsData, refetch } = trpc.catalog.products.list.useQuery({
    limit: 50,
    search: search || undefined,
    categoryId: categoryFilter || undefined,
    stockStatus: (stockFilter as "in_stock" | "out_of_stock" | "pre_order" | "reserved") || undefined,
  });

  const { data: categories } = trpc.catalog.categories.list.useQuery();

  const deleteProduct = trpc.catalog.products.delete.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        <Button onClick={() => router.push(`/${tenantSlug}/catalog/products/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          New Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories?.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <select
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value)}
        >
          <option value="">All Stock Status</option>
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="pre_order">Pre-order</option>
          <option value="reserved">Reserved</option>
        </select>
      </div>

      {/* Product List */}
      {productsData && productsData.data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {productsData.data.map((product) => {
            const status = stockStatusLabels[product.stockStatus] ?? { label: "In Stock", variant: "default" as const };
            return (
              <Card key={product.id} className="group cursor-pointer" onClick={() => router.push(`/${tenantSlug}/catalog/products/${product.id}`)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base line-clamp-1">{product.name}</CardTitle>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); router.push(`/${tenantSlug}/catalog/products/${product.id}`); }}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteProduct.mutate({ id: product.id }); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    {product.brand && <span className="text-sm text-muted-foreground">{product.brand}</span>}
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {product.isFeatured && <Badge variant="secondary">Featured</Badge>}
                    {product.isNew && <Badge variant="outline">New</Badge>}
                  </div>
                  {product.price && (
                    <p className="text-lg font-semibold">
                      {product.currency} {Number(product.price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  {product.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{product.description}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-lg mb-1">No products yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Add your first product to get started</p>
            <Button onClick={() => router.push(`/${tenantSlug}/catalog/products/new`)}>
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
