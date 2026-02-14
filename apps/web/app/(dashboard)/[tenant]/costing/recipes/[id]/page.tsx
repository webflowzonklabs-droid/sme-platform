"use client";

import { useState, useEffect, useRef } from "react";
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
} from "@sme/ui";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Scale,
  Copy,
  History,
  RefreshCw,
  Save,
} from "lucide-react";
import { trpc } from "@/trpc/client";

function fmt(value: string | number | null | undefined): string {
  if (value == null) return "₱0.00";
  return `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(value: string | number | null | undefined): string {
  if (value == null) return "—";
  return `${Number(value).toFixed(2)}%`;
}

function cogsColor(pct: number): string {
  if (pct < 30) return "text-green-600";
  if (pct <= 40) return "text-yellow-600";
  return "text-red-600";
}

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenant as string;
  const recipeId = params.id as string;

  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [showScale, setShowScale] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editYieldLoss, setEditYieldLoss] = useState("");
  const [editSellingPrice, setEditSellingPrice] = useState("");
  const [editVatPct, setEditVatPct] = useState("");
  const [editDiscountPct, setEditDiscountPct] = useState("");

  const { data: recipe, refetch, isLoading } = trpc.costing.recipes.get.useQuery(
    { id: recipeId },
  );

  const lastSyncedId = useRef<string | null>(null);
  useEffect(() => {
    if (recipe && !editMode && lastSyncedId.current !== recipe.id) {
      lastSyncedId.current = recipe.id;
      setEditName(recipe.name);
      setEditYieldLoss(recipe.yieldLossPct ?? "0");
      setEditSellingPrice(recipe.sellingPrice ?? "");
      setEditVatPct(recipe.vatPct ?? "12");
      setEditDiscountPct(recipe.discountPct ?? "0");
    }
  }, [recipe, editMode]);

  const utils = trpc.useUtils();

  const updateRecipe = trpc.costing.recipes.update.useMutation({
    onSuccess: () => { refetch(); setEditMode(false); },
  });
  const deleteRecipe = trpc.costing.recipes.delete.useMutation({
    onSuccess: () => router.push(`/${tenantSlug}/costing/recipes`),
  });
  const recalculate = trpc.costing.costing.recalculateRecipe.useMutation({
    onSuccess: () => refetch(),
  });
  const removeIngredient = trpc.costing.ingredients.remove.useMutation({
    onSuccess: () => refetch(),
  });
  const createVersion = trpc.costing.recipes.createVersion.useMutation({
    onSuccess: (newRecipe) => router.push(`/${tenantSlug}/costing/recipes/${newRecipe.id}`),
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (!recipe) return <div className="text-center py-12 text-muted-foreground">Recipe not found</div>;

  const isFinal = recipe.type === "final";
  const cogsPctNum = recipe.cogsPct ? Number(recipe.cogsPct) : null;

  // Calculations for display
  const totalCost = Number(recipe.totalCost ?? 0);
  const rawWeight = Number(recipe.rawWeight ?? 0);
  const netWeight = Number(recipe.netWeight ?? 0);
  const sellingPrice = Number(recipe.sellingPrice ?? 0);
  const vatPct = Number(recipe.vatPct ?? 12);
  const discountPct = Number(recipe.discountPct ?? 0);
  const priceWithVat = sellingPrice * (1 + vatPct / 100) * (1 - discountPct / 100);
  const profit = priceWithVat - totalCost;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/${tenantSlug}/costing/recipes`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          {editMode ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-2xl font-bold h-auto py-1"
            />
          ) : (
            <h1 className="text-3xl font-bold tracking-tight">{recipe.name}</h1>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={recipe.type === "final" ? "default" : "secondary"}>{recipe.type}</Badge>
            <Badge variant="outline">v{recipe.version}</Badge>
            {recipe.isCurrent && <Badge>Current</Badge>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {editMode ? (
            <>
              <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
              <Button
                onClick={() => updateRecipe.mutate({
                  id: recipeId,
                  name: editName,
                  yieldLossPct: editYieldLoss || undefined,
                  sellingPrice: editSellingPrice || null,
                  vatPct: editVatPct || undefined,
                  discountPct: editDiscountPct || undefined,
                })}
                disabled={updateRecipe.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditMode(true)}>Edit</Button>
              <Button variant="outline" onClick={() => recalculate.mutate({ recipeId })} disabled={recalculate.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${recalculate.isPending ? "animate-spin" : ""}`} />
                Recalculate
              </Button>
              <Button variant="outline" onClick={() => setShowScale(true)}>
                <Scale className="mr-2 h-4 w-4" />
                Scale
              </Button>
              <Button variant="outline" onClick={() => setShowDuplicate(true)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
              <Button variant="outline" onClick={() => createVersion.mutate({ id: recipeId })} disabled={createVersion.isPending}>
                <History className="mr-2 h-4 w-4" />
                New Version
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Raw Weight</p>
            <p className="text-lg font-semibold">{rawWeight.toFixed(2)}g</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Net Weight</p>
            <p className="text-lg font-semibold">{netWeight.toFixed(2)}g</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="text-lg font-semibold">{fmt(totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Cost/gram</p>
            <p className="text-lg font-semibold">₱{Number(recipe.costPerGram ?? 0).toFixed(4)}</p>
          </CardContent>
        </Card>
        {isFinal && (
          <>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">COGS%</p>
                <p className={`text-lg font-semibold ${cogsPctNum != null ? cogsColor(cogsPctNum) : ""}`}>
                  {fmtPct(recipe.cogsPct)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Profit</p>
                <p className={`text-lg font-semibold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(profit)}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Edit fields for yield/selling price */}
      {editMode && (
        <Card>
          <CardHeader><CardTitle>Recipe Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Yield Loss %</Label>
                <Input value={editYieldLoss} onChange={(e) => setEditYieldLoss(e.target.value)} type="number" step="0.01" />
              </div>
              {isFinal && (
                <>
                  <div className="space-y-2">
                    <Label>Selling Price</Label>
                    <Input value={editSellingPrice} onChange={(e) => setEditSellingPrice(e.target.value)} type="number" step="0.01" />
                  </div>
                  <div className="space-y-2">
                    <Label>VAT %</Label>
                    <Input value={editVatPct} onChange={(e) => setEditVatPct(e.target.value)} type="number" step="0.01" />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount %</Label>
                    <Input value={editDiscountPct} onChange={(e) => setEditDiscountPct(e.target.value)} type="number" step="0.01" />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ingredients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ingredients</CardTitle>
          <Button size="sm" onClick={() => setShowAddIngredient(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Ingredient
          </Button>
        </CardHeader>
        <CardContent>
          {recipe.ingredients && recipe.ingredients.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Extended Cost</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipe.ingredients.map((ing: any) => (
                  <TableRow key={ing.id}>
                    <TableCell>
                      <Badge variant={ing.ingredientType === "raw" ? "outline" : "secondary"}>
                        {ing.ingredientType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{ing.name}</TableCell>
                    <TableCell className="text-right font-mono">{Number(ing.amount).toFixed(2)}g</TableCell>
                    <TableCell className="text-right font-mono">₱{Number(ing.unitCost).toFixed(6)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(ing.extendedCost)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeIngredient.mutate({ id: ing.id, recipeId })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell colSpan={4} className="text-right">Total</TableCell>
                  <TableCell className="text-right font-mono">{fmt(totalCost)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No ingredients yet. Add ingredients to calculate costs.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete */}
      <div className="flex justify-end">
        <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>Delete Recipe</Button>
      </div>

      {/* Dialogs */}
      {showAddIngredient && (
        <AddIngredientDialog
          recipeId={recipeId}
          onClose={() => setShowAddIngredient(false)}
          onSuccess={() => { refetch(); setShowAddIngredient(false); }}
        />
      )}

      {showScale && (
        <ScaleDialog
          recipeId={recipeId}
          recipeName={recipe.name}
          onClose={() => setShowScale(false)}
          onSuccess={() => { refetch(); setShowScale(false); }}
        />
      )}

      {showDuplicate && (
        <DuplicateDialog
          recipeId={recipeId}
          recipeName={recipe.name}
          tenantSlug={tenantSlug}
          onClose={() => setShowDuplicate(false)}
        />
      )}

      {showDeleteConfirm && (
        <Dialog open onOpenChange={() => setShowDeleteConfirm(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Recipe</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{recipe.name}&quot;? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteRecipe.mutate({ id: recipeId })}
                disabled={deleteRecipe.isPending}
              >
                {deleteRecipe.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============================================
// Add Ingredient Dialog
// ============================================
function AddIngredientDialog({
  recipeId,
  onClose,
  onSuccess,
}: {
  recipeId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [ingredientType, setIngredientType] = useState<"raw" | "base">("raw");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [amount, setAmount] = useState("");

  const { data: inventoryItems } = trpc.costing.inventory.list.useQuery({});
  const { data: baseRecipes } = trpc.costing.recipes.list.useQuery({ type: "base" });

  const addIngredient = trpc.costing.ingredients.add.useMutation({
    onSuccess,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Ingredient</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={ingredientType}
              onChange={(e) => { setIngredientType(e.target.value as "raw" | "base"); setSelectedItemId(""); }}
            >
              <option value="raw">Raw Material</option>
              <option value="base">Base Recipe</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>{ingredientType === "raw" ? "Inventory Item" : "Base Recipe"} *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
            >
              <option value="">Select...</option>
              {ingredientType === "raw"
                ? inventoryItems?.items.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}{item.brand ? ` (${item.brand})` : ""}</option>
                  ))
                : baseRecipes?.items.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} v{r.version}</option>
                  ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Amount (grams) *</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" type="number" step="0.01" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => addIngredient.mutate({
              recipeId,
              ingredientType,
              inventoryItemId: ingredientType === "raw" ? selectedItemId : undefined,
              baseRecipeId: ingredientType === "base" ? selectedItemId : undefined,
              amount,
            })}
            disabled={!selectedItemId || !amount || addIngredient.isPending}
          >
            {addIngredient.isPending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Scale Dialog
// ============================================
function ScaleDialog({
  recipeId,
  recipeName,
  onClose,
  onSuccess,
}: {
  recipeId: string;
  recipeName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [factor, setFactor] = useState("2");

  const scale = trpc.costing.recipes.scale.useMutation({ onSuccess });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scale Recipe</DialogTitle>
          <DialogDescription>
            Scale all ingredient amounts in &quot;{recipeName}&quot; by a factor. This will modify the current recipe. A snapshot will be created automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Scale Factor</Label>
          <Input value={factor} onChange={(e) => setFactor(e.target.value)} type="number" step="0.1" min="0.1" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => scale.mutate({ id: recipeId, factor: Number(factor) })}
            disabled={!factor || Number(factor) <= 0 || scale.isPending}
          >
            {scale.isPending ? "Scaling..." : `Scale x${factor}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Duplicate Dialog
// ============================================
function DuplicateDialog({
  recipeId,
  recipeName,
  tenantSlug,
  onClose,
}: {
  recipeId: string;
  recipeName: string;
  tenantSlug: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState(`${recipeName} (Copy)`);

  const duplicate = trpc.costing.recipes.duplicate.useMutation({
    onSuccess: (newRecipe) => {
      router.push(`/${tenantSlug}/costing/recipes/${newRecipe.id}`);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Recipe</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>New Name *</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => duplicate.mutate({ id: recipeId, newName })}
            disabled={!newName || duplicate.isPending}
          >
            {duplicate.isPending ? "Duplicating..." : "Duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
