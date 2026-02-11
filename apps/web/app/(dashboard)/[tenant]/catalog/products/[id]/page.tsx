"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@sme/ui";
import { ArrowLeft, Plus, Trash2, Star } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenant as string;
  const productId = params.id as string;

  const { data: product, refetch } = trpc.catalog.products.get.useQuery({ id: productId });
  const { data: categories } = trpc.catalog.categories.list.useQuery();
  const { data: attributeDefs } = trpc.catalog.attributes.list.useQuery();

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
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});

  // Photo dialog
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoAlt, setPhotoAlt] = useState("");

  const { data: subcategories } = trpc.catalog.subcategories.list.useQuery(
    categoryId ? { categoryId } : undefined,
  );

  useEffect(() => {
    if (product) {
      setName(product.name);
      setBrand(product.brand ?? "");
      setDescription(product.description ?? "");
      setPrice(product.price ?? "");
      setCurrency(product.currency);
      setCategoryId(product.categoryId);
      setStockStatus(product.stockStatus);
      setIsFeatured(product.isFeatured);
      setIsNew(product.isNew);
      setSelectedSubcategories(product.subcategoryIds);
      const attrMap: Record<string, string> = {};
      product.attributes.forEach((a) => { attrMap[a.attributeDefinitionId] = a.value; });
      setAttributeValues(attrMap);
    }
  }, [product]);

  const updateProduct = trpc.catalog.products.update.useMutation({
    onSuccess: () => refetch(),
  });

  const addPhoto = trpc.catalog.photos.add.useMutation({
    onSuccess: () => { setPhotoDialogOpen(false); setPhotoUrl(""); setPhotoAlt(""); refetch(); },
  });

  const removePhoto = trpc.catalog.photos.remove.useMutation({
    onSuccess: () => refetch(),
  });

  const setPrimaryPhoto = trpc.catalog.photos.setPrimary.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSave = () => {
    if (!name || !categoryId) return;

    const attributes = Object.entries(attributeValues)
      .filter(([, v]) => v.trim())
      .map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value }));

    updateProduct.mutate({
      id: productId,
      name,
      brand: brand || null,
      description: description || null,
      price: price || null,
      currency,
      categoryId,
      stockStatus: stockStatus as "in_stock" | "out_of_stock" | "pre_order" | "reserved",
      isFeatured,
      isNew,
      subcategoryIds: selectedSubcategories,
      attributes,
    });
  };

  if (!product) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/${tenantSlug}/catalog/products`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Product</h1>
          <p className="text-muted-foreground">{product.name}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Status */}
        <Card>
          <CardHeader><CardTitle>Pricing & Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stock Status</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
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

        {/* Category */}
        <Card>
          <CardHeader><CardTitle>Category</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSelectedSubcategories([]); }}>
                <option value="">Select category...</option>
                {categories?.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
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
                          if (e.target.checked) setSelectedSubcategories([...selectedSubcategories, sub.id]);
                          else setSelectedSubcategories(selectedSubcategories.filter((id) => id !== sub.id));
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

        {/* Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Photos</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setPhotoDialogOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Add Photo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {product.photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {product.photos.map((photo) => (
                  <div key={photo.id} className="relative group rounded-md overflow-hidden border">
                    <img src={photo.url} alt={photo.altText ?? ""} className="w-full h-24 object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-white" onClick={() => setPrimaryPhoto.mutate({ id: photo.id })}>
                        <Star className={`h-3.5 w-3.5 ${photo.isPrimary ? "fill-yellow-400" : ""}`} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-white" onClick={() => removePhoto.mutate({ id: photo.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {photo.isPrimary && <Badge className="absolute top-1 left-1 text-xs">Primary</Badge>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No photos yet</p>
            )}
          </CardContent>
        </Card>

        {/* Custom Attributes */}
        {attributeDefs && attributeDefs.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Custom Attributes</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {attributeDefs.map((def) => (
                  <div key={def.id} className="space-y-2">
                    <Label>{def.name}{def.isRequired && <span className="text-destructive ml-1">*</span>}</Label>
                    {def.type === "select" && def.options ? (
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={attributeValues[def.id] ?? ""} onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}>
                        <option value="">Select...</option>
                        {(def.options as string[]).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : def.type === "boolean" ? (
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={attributeValues[def.id] ?? ""} onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <Input type={def.type === "number" ? "number" : "text"} value={attributeValues[def.id] ?? ""} onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.push(`/${tenantSlug}/catalog/products`)}>Cancel</Button>
        <Button onClick={handleSave} disabled={!name || !categoryId || updateProduct.isPending}>
          {updateProduct.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Add Photo Dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Photo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Photo URL *</Label>
              <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Alt Text</Label>
              <Input value={photoAlt} onChange={(e) => setPhotoAlt(e.target.value)} placeholder="Describe the image" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotoDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => addPhoto.mutate({ productId, url: photoUrl, altText: photoAlt || undefined })} disabled={!photoUrl || addPhoto.isPending}>
              {addPhoto.isPending ? "Adding..." : "Add Photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
