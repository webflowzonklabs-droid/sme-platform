"use client";

import { useState } from "react";
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
  DialogDescription,
} from "@sme/ui";
import { Plus, Trash2, Edit, FolderTree, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function CategoriesPage() {
  const { data: categories, refetch: refetchCategories } = trpc.catalog.categories.list.useQuery();
  const { data: allSubcategories, refetch: refetchSubs } = trpc.catalog.subcategories.list.useQuery();

  const refetch = () => { refetchCategories(); refetchSubs(); };

  // Category dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catDescription, setCatDescription] = useState("");

  // Subcategory dialog
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [subName, setSubName] = useState("");
  const [subDescription, setSubDescription] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");

  // Expanded categories
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const createCategory = trpc.catalog.categories.create.useMutation({ onSuccess: () => { setCatDialogOpen(false); resetCatForm(); refetch(); } });
  const updateCategory = trpc.catalog.categories.update.useMutation({ onSuccess: () => { setCatDialogOpen(false); resetCatForm(); refetch(); } });
  const deleteCategory = trpc.catalog.categories.delete.useMutation({ onSuccess: () => refetch() });

  const createSubcategory = trpc.catalog.subcategories.create.useMutation({ onSuccess: () => { setSubDialogOpen(false); resetSubForm(); refetch(); } });
  const updateSubcategory = trpc.catalog.subcategories.update.useMutation({ onSuccess: () => { setSubDialogOpen(false); resetSubForm(); refetch(); } });
  const deleteSubcategory = trpc.catalog.subcategories.delete.useMutation({ onSuccess: () => refetch() });

  const resetCatForm = () => { setEditCatId(null); setCatName(""); setCatDescription(""); };
  const resetSubForm = () => { setEditSubId(null); setSubName(""); setSubDescription(""); setSubCategoryId(""); };

  const openEditCategory = (cat: { id: string; name: string; description: string | null }) => {
    setEditCatId(cat.id);
    setCatName(cat.name);
    setCatDescription(cat.description ?? "");
    setCatDialogOpen(true);
  };

  const openAddSubcategory = (categoryId: string) => {
    resetSubForm();
    setSubCategoryId(categoryId);
    setSubDialogOpen(true);
  };

  const openEditSubcategory = (sub: { id: string; name: string; description: string | null; categoryId: string }) => {
    setEditSubId(sub.id);
    setSubName(sub.name);
    setSubDescription(sub.description ?? "");
    setSubCategoryId(sub.categoryId);
    setSubDialogOpen(true);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">Organize your products into categories and subcategories</p>
        </div>
        <Button onClick={() => { resetCatForm(); setCatDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Category
        </Button>
      </div>

      {categories && categories.length > 0 ? (
        <div className="space-y-3">
          {categories.map((cat) => {
            const subs = allSubcategories?.filter((s) => s.categoryId === cat.id) ?? [];
            const isExpanded = expanded.has(cat.id);
            return (
              <Card key={cat.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleExpand(cat.id)}>
                      {subs.length > 0 ? (
                        isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                      ) : <div className="w-4" />}
                      <CardTitle className="text-base">{cat.name}</CardTitle>
                      <Badge variant="secondary">{cat.productCount} products</Badge>
                      {!cat.isActive && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openAddSubcategory(cat.id)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Sub
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditCategory(cat)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteCategory.mutate({ id: cat.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {cat.description && <p className="text-sm text-muted-foreground ml-6">{cat.description}</p>}
                </CardHeader>
                {isExpanded && subs.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="ml-6 space-y-2 border-l pl-4">
                      {subs.map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between py-1">
                          <div>
                            <span className="text-sm font-medium">{sub.name}</span>
                            {!sub.isActive && <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>}
                            {sub.description && <p className="text-xs text-muted-foreground">{sub.description}</p>}
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditSubcategory(sub)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSubcategory.mutate({ id: sub.id })}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderTree className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-lg mb-1">No categories yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create categories to organize your products</p>
            <Button onClick={() => { resetCatForm(); setCatDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> New Category
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCatId ? "Edit Category" : "New Category"}</DialogTitle>
            <DialogDescription>{editCatId ? "Update category details" : "Create a new product category"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Category name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                placeholder="Optional description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!catName}
              onClick={() => {
                if (editCatId) updateCategory.mutate({ id: editCatId, name: catName, description: catDescription || null });
                else createCategory.mutate({ name: catName, description: catDescription || undefined });
              }}
            >
              {editCatId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subcategory Dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editSubId ? "Edit Subcategory" : "New Subcategory"}</DialogTitle>
            <DialogDescription>{editSubId ? "Update subcategory details" : "Create a new subcategory"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Subcategory name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={subDescription}
                onChange={(e) => setSubDescription(e.target.value)}
                placeholder="Optional description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!subName || !subCategoryId}
              onClick={() => {
                if (editSubId) updateSubcategory.mutate({ id: editSubId, name: subName, description: subDescription || null });
                else createSubcategory.mutate({ categoryId: subCategoryId, name: subName, description: subDescription || undefined });
              }}
            >
              {editSubId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
