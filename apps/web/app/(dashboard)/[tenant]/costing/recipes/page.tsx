"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Label,
} from "@sme/ui";
import { Plus, Search, ChefHat } from "lucide-react";
import { trpc } from "@/trpc/client";

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return "₱0.00";
  return `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: string | number | null | undefined): string {
  if (value == null) return "—";
  return `${Number(value).toFixed(2)}%`;
}

function cogsColor(pct: number): string {
  if (pct < 30) return "text-green-600";
  if (pct <= 40) return "text-yellow-600";
  return "text-red-600";
}

export default function RecipesPage() {
  const params = useParams();
  const router = useRouter();
  const tenantSlug = params.tenant as string;

  const [tab, setTab] = useState<"base" | "final">("base");
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data, isLoading } = trpc.costing.recipes.list.useQuery({
    type: tab,
    search: search || undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
          <p className="text-muted-foreground">Manage base and final product recipes</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Recipe
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "base" | "final")}>
        <div className="flex items-center gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="base">Base Products</TabsTrigger>
            <TabsTrigger value="final">Final Products</TabsTrigger>
          </TabsList>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <TabsContent value="base" className="mt-4">
          <RecipeTable
            recipes={data?.items ?? []}
            isLoading={isLoading}
            type="base"
            tenantSlug={tenantSlug}
            onNavigate={(id) => router.push(`/${tenantSlug}/costing/recipes/${id}`)}
            onNew={() => setShowCreateDialog(true)}
          />
        </TabsContent>
        <TabsContent value="final" className="mt-4">
          <RecipeTable
            recipes={data?.items ?? []}
            isLoading={isLoading}
            type="final"
            tenantSlug={tenantSlug}
            onNavigate={(id) => router.push(`/${tenantSlug}/costing/recipes/${id}`)}
            onNew={() => setShowCreateDialog(true)}
          />
        </TabsContent>
      </Tabs>

      {showCreateDialog && (
        <CreateRecipeDialog
          onClose={() => setShowCreateDialog(false)}
          tenantSlug={tenantSlug}
          defaultType={tab}
        />
      )}
    </div>
  );
}

function RecipeTable({
  recipes,
  isLoading,
  type,
  tenantSlug,
  onNavigate,
  onNew,
}: {
  recipes: any[];
  isLoading: boolean;
  type: string;
  tenantSlug: string;
  onNavigate: (id: string) => void;
  onNew: () => void;
}) {
  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Loading...</CardContent></Card>;
  }

  if (recipes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ChefHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg mb-1">No {type} recipes yet</h3>
          <p className="text-muted-foreground text-sm mb-4">Create your first {type} recipe</p>
          <Button onClick={onNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Recipe
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Version</TableHead>
            <TableHead className="text-right">Total Cost</TableHead>
            <TableHead className="text-right">Cost/gram</TableHead>
            {type === "final" && <TableHead className="text-right">COGS%</TableHead>}
            {type === "final" && <TableHead className="text-right">Selling Price</TableHead>}
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recipes.map((recipe) => (
            <TableRow
              key={recipe.id}
              className="cursor-pointer"
              onClick={() => onNavigate(recipe.id)}
            >
              <TableCell className="font-medium">{recipe.name}</TableCell>
              <TableCell>
                <Badge variant="outline">v{recipe.version}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(recipe.totalCost)}</TableCell>
              <TableCell className="text-right font-mono">
                {recipe.costPerGram ? `₱${Number(recipe.costPerGram).toFixed(4)}` : "—"}
              </TableCell>
              {type === "final" && (
                <TableCell className={`text-right font-mono font-semibold ${recipe.cogsPct ? cogsColor(Number(recipe.cogsPct)) : ""}`}>
                  {formatPct(recipe.cogsPct)}
                </TableCell>
              )}
              {type === "final" && (
                <TableCell className="text-right font-mono">{formatCurrency(recipe.sellingPrice)}</TableCell>
              )}
              <TableCell>
                <Badge variant={recipe.isCurrent ? "default" : "secondary"}>
                  {recipe.isCurrent ? "Current" : "Old"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function CreateRecipeDialog({
  onClose,
  tenantSlug,
  defaultType,
}: {
  onClose: () => void;
  tenantSlug: string;
  defaultType: "base" | "final";
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"base" | "final">(defaultType);
  const [yieldLossPct, setYieldLossPct] = useState("0");
  const [sellingPrice, setSellingPrice] = useState("");
  const [vatPct, setVatPct] = useState("12");
  const [discountPct, setDiscountPct] = useState("0");

  const createRecipe = trpc.costing.recipes.create.useMutation({
    onSuccess: (recipe) => {
      router.push(`/${tenantSlug}/costing/recipes/${recipe.id}`);
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Recipe</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mango Jam" />
          </div>
          <div className="space-y-2">
            <Label>Type *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as "base" | "final")}
            >
              <option value="base">Base Product</option>
              <option value="final">Final Product</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Yield Loss %</Label>
            <Input value={yieldLossPct} onChange={(e) => setYieldLossPct(e.target.value)} type="number" step="0.01" />
          </div>
          {type === "final" && (
            <>
              <div className="space-y-2">
                <Label>Selling Price</Label>
                <Input value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0.00" type="number" step="0.01" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>VAT %</Label>
                  <Input value={vatPct} onChange={(e) => setVatPct(e.target.value)} type="number" step="0.01" />
                </div>
                <div className="space-y-2">
                  <Label>Discount %</Label>
                  <Input value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} type="number" step="0.01" />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createRecipe.mutate({
              name,
              type,
              yieldLossPct: yieldLossPct || undefined,
              sellingPrice: sellingPrice || undefined,
              vatPct: vatPct || undefined,
              discountPct: discountPct || undefined,
            })}
            disabled={!name || createRecipe.isPending}
          >
            {createRecipe.isPending ? "Creating..." : "Create Recipe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
