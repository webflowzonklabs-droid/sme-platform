"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@sme/ui";
import {
  Plus,
  Search,
  Trash2,
  Edit,
  Package,
  DollarSign,
  History,
  ArrowLeft,
} from "lucide-react";
import { trpc } from "@/trpc/client";

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return "₱0.00";
  return `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPrice(value: string | number | null | undefined): string {
  if (value == null) return "₱0.000000";
  return `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
}

const categoryColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  secondary: "secondary",
  packaging: "outline",
};

type InventoryItem = {
  id: string;
  name: string;
  brand: string | null;
  unitType: string;
  unit: string;
  unitSizeGrams: string | null;
  category: string;
  tags: string[] | null;
  primarySupplier: string | null;
  secondarySupplier: string | null;
  notes: string | null;
  isActive: boolean;
  currentPricePerUnit: string | null;
};

export default function InventoryPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showPriceDialog, setShowPriceDialog] = useState<string | null>(null);
  const [showDetailItem, setShowDetailItem] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, refetch, isLoading } = trpc.costing.inventory.list.useQuery({
    search: search || undefined,
    category: categoryFilter || undefined,
  });

  const createItem = trpc.costing.inventory.create.useMutation({
    onSuccess: () => { refetch(); setShowAddDialog(false); setEditingItem(null); },
  });
  const updateItem = trpc.costing.inventory.update.useMutation({
    onSuccess: () => { refetch(); setEditingItem(null); },
  });
  const deleteItem = trpc.costing.inventory.delete.useMutation({
    onSuccess: () => { refetch(); setDeleteConfirm(null); },
  });

  return (
    <div className="space-y-6">
      {showDetailItem ? (
        <ItemDetail
          itemId={showDetailItem}
          onBack={() => setShowDetailItem(null)}
          onRefresh={refetch}
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Inventory Items</h1>
              <p className="text-muted-foreground">Manage raw materials and packaging</p>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
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
              <option value="critical">Critical</option>
              <option value="secondary">Secondary</option>
              <option value="packaging">Packaging</option>
            </select>
          </div>

          {/* Table */}
          {isLoading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Loading...</CardContent></Card>
          ) : data && data.items.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Price/Unit</TableHead>
                    <TableHead>Primary Supplier</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => setShowDetailItem(item.id)}
                    >
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.brand || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={categoryColors[item.category] ?? "default"}>
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.currentPricePerUnit ? formatPrice(item.currentPricePerUnit) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.primarySupplier || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Update Price"
                            onClick={() => setShowPriceDialog(item.id)}
                          >
                            <DollarSign className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingItem(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteConfirm(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-lg mb-1">No inventory items yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Add your first raw material or packaging item</p>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Add/Edit Dialog */}
      {(showAddDialog || editingItem) && (
        <ItemFormDialog
          item={editingItem}
          onClose={() => { setShowAddDialog(false); setEditingItem(null); }}
          onCreate={(data) => createItem.mutate(data)}
          onUpdate={(data) => updateItem.mutate(data)}
          isPending={createItem.isPending || updateItem.isPending}
        />
      )}

      {/* Update Price Dialog */}
      {showPriceDialog && (
        <UpdatePriceDialog
          itemId={showPriceDialog}
          onClose={() => setShowPriceDialog(null)}
          onSuccess={() => { refetch(); setShowPriceDialog(null); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <Dialog open onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Item</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this inventory item? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteItem.mutate({ id: deleteConfirm })}
                disabled={deleteItem.isPending}
              >
                {deleteItem.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============================================
// Item Form Dialog
// ============================================
function ItemFormDialog({
  item,
  onClose,
  onCreate,
  onUpdate,
  isPending,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onCreate: (data: any) => void;
  onUpdate: (data: any) => void;
  isPending: boolean;
}) {
  const isEdit = !!item;
  const [name, setName] = useState(item?.name ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [unitType, setUnitType] = useState(item?.unitType ?? "weight");
  const [unit, setUnit] = useState(item?.unit ?? "kg");
  const [unitSizeGrams, setUnitSizeGrams] = useState(item?.unitSizeGrams ?? "");
  const [category, setCategory] = useState(item?.category ?? "critical");
  const [primarySupplier, setPrimarySupplier] = useState(item?.primarySupplier ?? "");
  const [secondarySupplier, setSecondarySupplier] = useState(item?.secondarySupplier ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  // Initial price (only for create)
  const [purchasePrice, setPurchasePrice] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [priceSupplier, setPriceSupplier] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0]!);

  const handleSubmit = () => {
    if (!name) return;
    if (isEdit) {
      onUpdate({
        id: item.id,
        name,
        brand: brand || null,
        unitType: unitType as "weight" | "piece",
        unit,
        unitSizeGrams: unitSizeGrams || null,
        category,
        primarySupplier: primarySupplier || null,
        secondarySupplier: secondarySupplier || null,
        notes: notes || null,
      });
    } else {
      const initialPrice = purchasePrice && pricePerUnit
        ? {
            purchasePrice,
            pricePerUnit,
            supplier: priceSupplier || undefined,
            effectiveDate,
          }
        : undefined;
      onCreate({
        name,
        brand: brand || undefined,
        unitType: unitType as "weight" | "piece",
        unit,
        unitSizeGrams: unitSizeGrams || undefined,
        category,
        primarySupplier: primarySupplier || undefined,
        secondarySupplier: secondarySupplier || undefined,
        notes: notes || undefined,
        initialPrice,
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. All Purpose Flour" />
          </div>
          <div className="space-y-2">
            <Label>Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Emborg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Unit Type *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
              >
                <option value="weight">Weight</option>
                <option value="piece">Piece</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Unit *</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, g, piece" />
            </div>
          </div>
          {unitType === "weight" && (
            <div className="space-y-2">
              <Label>Unit Size (grams)</Label>
              <Input value={unitSizeGrams} onChange={(e) => setUnitSizeGrams(e.target.value)} placeholder="e.g. 1000 for 1kg" type="number" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Category *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="critical">Critical</option>
              <option value="secondary">Secondary</option>
              <option value="packaging">Packaging</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Supplier</Label>
              <Input value={primarySupplier} onChange={(e) => setPrimarySupplier(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Secondary Supplier</Label>
              <Input value={secondarySupplier} onChange={(e) => setSecondarySupplier(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Initial Price (create only) */}
          {!isEdit && (
            <>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Initial Price (optional)</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Purchase Price</Label>
                  <Input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0.00" type="number" step="0.01" />
                </div>
                <div className="space-y-2">
                  <Label>Price Per Unit</Label>
                  <Input value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder="0.000000" type="number" step="0.000001" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Input value={priceSupplier} onChange={(e) => setPriceSupplier(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Effective Date</Label>
                  <Input value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} type="date" />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name || isPending}>
            {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Update Price Dialog
// ============================================
function UpdatePriceDialog({
  itemId,
  onClose,
  onSuccess,
}: {
  itemId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [purchasePrice, setPurchasePrice] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [supplier, setSupplier] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0]!);
  const [notes, setNotes] = useState("");

  const updatePrice = trpc.costing.inventory.updatePrice.useMutation({
    onSuccess,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Price</DialogTitle>
          <DialogDescription>Add a new price entry for this item</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Purchase Price *</Label>
              <Input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0.00" type="number" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>Price Per Unit *</Label>
              <Input value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder="0.000000" type="number" step="0.000001" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Effective Date *</Label>
              <Input value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => updatePrice.mutate({
              itemId,
              purchasePrice,
              pricePerUnit,
              supplier: supplier || undefined,
              effectiveDate,
              notes: notes || undefined,
            })}
            disabled={!purchasePrice || !pricePerUnit || updatePrice.isPending}
          >
            {updatePrice.isPending ? "Saving..." : "Update Price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Item Detail View
// ============================================
function ItemDetail({
  itemId,
  onBack,
  onRefresh,
}: {
  itemId: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const { data: item, isLoading } = trpc.costing.inventory.get.useQuery({ id: itemId });
  const { data: priceHistory } = trpc.costing.priceHistory.getForItem.useQuery({ itemId });
  const [showPriceDialog, setShowPriceDialog] = useState(false);

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (!item) return <div className="text-center py-12 text-muted-foreground">Item not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{item.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            {item.brand && <span className="text-muted-foreground">{item.brand}</span>}
            <Badge variant={categoryColors[item.category] ?? "default"}>{item.category}</Badge>
          </div>
        </div>
        <Button onClick={() => setShowPriceDialog(true)}>
          <DollarSign className="mr-2 h-4 w-4" />
          Update Price
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Unit Type</span><span>{item.unitType}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unit</span><span>{item.unit}</span></div>
            {item.unitSizeGrams && <div className="flex justify-between"><span className="text-muted-foreground">Unit Size</span><span>{item.unitSizeGrams}g</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Primary Supplier</span><span>{item.primarySupplier || "—"}</span></div>
            {item.secondarySupplier && <div className="flex justify-between"><span className="text-muted-foreground">Secondary Supplier</span><span>{item.secondarySupplier}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Current Price/Unit</span><span className="font-mono font-semibold">{item.currentPricePerUnit ? formatPrice(item.currentPricePerUnit) : "—"}</span></div>
            {item.notes && <div className="pt-2 border-t"><p className="text-sm text-muted-foreground">{item.notes}</p></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Price History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {priceHistory && priceHistory.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Purchase</TableHead>
                    <TableHead className="text-right">Per Unit</TableHead>
                    <TableHead>Supplier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistory.map((ph) => (
                    <TableRow key={ph.id}>
                      <TableCell>{ph.effectiveDate}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(ph.purchasePrice)}</TableCell>
                      <TableCell className="text-right font-mono">{formatPrice(ph.pricePerUnit)}</TableCell>
                      <TableCell className="text-muted-foreground">{ph.supplier || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No price history yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {showPriceDialog && (
        <UpdatePriceDialog
          itemId={itemId}
          onClose={() => setShowPriceDialog(false)}
          onSuccess={() => { onRefresh(); setShowPriceDialog(false); }}
        />
      )}
    </div>
  );
}
