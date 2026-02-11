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
  Label,
} from "@sme/ui";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function NewProductPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenant as string;

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [categoryId, setCategoryId] = useState("");
  const [stockStatus, setStockStatus] = useState("in_stock");
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);

  const { data: categories } = trpc.catalog.categories.list.useQuery();
  const { data: subcategories } = trpc.catalog.subcategories.list.useQuery(
    categoryId ? { categoryId } : undefined,
  );
  const { data: attributeDefs } = trpc.catalog.attributes.list.useQuery();

  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});

  const createProduct = trpc.catalog.products.create.useMutation({
    onSuccess: (product) => {
      router.push(`/${tenantSlug}/catalog/products/${product.id}`);
    },
  });

  const handleSubmit = () => {
    if (!name || !categoryId) return;

    const attributes = Object.entries(attributeValues)
      .filter(([, v]) => v.trim())
      .map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value }));

    createProduct.mutate({
      name,
      brand: brand || undefined,
      description: description || undefined,
      price: price || undefined,
      currency,
      categoryId,
      stockStatus: stockStatus as "in_stock" | "out_of_stock" | "pre_order" | "reserved",
      isFeatured,
      isNew,
      subcategoryIds: selectedSubcategories.length > 0 ? selectedSubcategories : undefined,
      attributes: attributes.length > 0 ? attributes : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/${tenantSlug}/catalog/products`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Product</h1>
          <p className="text-muted-foreground">Add a new product to your catalog</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product description..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Status */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing & Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stock Status</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value)}
              >
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="pre_order">Pre-order</option>
                <option value="reserved">Reserved</option>
              </select>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                <span className="text-sm">Featured</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} />
                <span className="text-sm">New</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Category & Subcategories */}
        <Card>
          <CardHeader>
            <CardTitle>Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setSelectedSubcategories([]); }}
              >
                <option value="">Select category...</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            {subcategories && subcategories.length > 0 && (
              <div className="space-y-2">
                <Label>Subcategories</Label>
                <div className="grid grid-cols-2 gap-2">
                  {subcategories.map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSubcategories.includes(sub.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSubcategories([...selectedSubcategories, sub.id]);
                          } else {
                            setSelectedSubcategories(selectedSubcategories.filter((id) => id !== sub.id));
                          }
                        }}
                      />
                      <span className="text-sm">{sub.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Custom Attributes */}
        {attributeDefs && attributeDefs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Custom Attributes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {attributeDefs.map((def) => (
                <div key={def.id} className="space-y-2">
                  <Label>
                    {def.name}
                    {def.isRequired && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {def.type === "select" && def.options ? (
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={attributeValues[def.id] ?? ""}
                      onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {(def.options as string[]).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : def.type === "boolean" ? (
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={attributeValues[def.id] ?? ""}
                      onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <Input
                      type={def.type === "number" ? "number" : "text"}
                      value={attributeValues[def.id] ?? ""}
                      onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}
                      placeholder={`Enter ${def.name.toLowerCase()}...`}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.push(`/${tenantSlug}/catalog/products`)}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!name || !categoryId || createProduct.isPending}>
          {createProduct.isPending ? "Creating..." : "Create Product"}
        </Button>
      </div>
    </div>
  );
}
