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
import { Plus, Trash2, Edit, Settings2 } from "lucide-react";
import { trpc } from "@/trpc/client";

const typeLabels: Record<string, string> = {
  text: "Text",
  number: "Number",
  boolean: "Yes/No",
  select: "Select",
};

export default function AttributesPage() {
  const { data: attributes, refetch } = trpc.catalog.attributes.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "number" | "boolean" | "select">("text");
  const [options, setOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  const createAttr = trpc.catalog.attributes.define.useMutation({ onSuccess: () => { setDialogOpen(false); resetForm(); refetch(); } });
  const updateAttr = trpc.catalog.attributes.update.useMutation({ onSuccess: () => { setDialogOpen(false); resetForm(); refetch(); } });
  const deleteAttr = trpc.catalog.attributes.delete.useMutation({ onSuccess: () => refetch() });

  const resetForm = () => { setEditId(null); setName(""); setType("text"); setOptions(""); setIsRequired(false); };

  const openEdit = (attr: { id: string; name: string; type: string; options: unknown; isRequired: boolean }) => {
    setEditId(attr.id);
    setName(attr.name);
    setType(attr.type as "text" | "number" | "boolean" | "select");
    setOptions(attr.type === "select" && Array.isArray(attr.options) ? (attr.options as string[]).join(", ") : "");
    setIsRequired(attr.isRequired);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name) return;
    const optionsList = type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined;

    if (editId) {
      updateAttr.mutate({ id: editId, name, type, options: optionsList ?? null, isRequired });
    } else {
      createAttr.mutate({ name, type, options: optionsList, isRequired });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Custom Attributes</h1>
          <p className="text-muted-foreground">Define custom fields for your products</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Attribute
        </Button>
      </div>

      {attributes && attributes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {attributes.map((attr) => (
            <Card key={attr.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{attr.name}</CardTitle>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(attr)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAttr.mutate({ id: attr.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{typeLabels[attr.type] ?? attr.type}</Badge>
                  {attr.isRequired && <Badge variant="outline">Required</Badge>}
                </div>
                {attr.type === "select" && attr.options && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Options: {(attr.options as string[]).join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-lg mb-1">No custom attributes</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Define custom fields to capture industry-specific product data
            </p>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> New Attribute
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Attribute Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Attribute" : "New Attribute"}</DialogTitle>
            <DialogDescription>
              {editId ? "Update attribute definition" : "Define a new custom attribute for products"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Color, Weight, Shelf Life" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as "text" | "number" | "boolean" | "select")}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Yes/No</option>
                <option value="select">Select (dropdown)</option>
              </select>
            </div>
            {type === "select" && (
              <div className="space-y-2">
                <Label>Options (comma-separated)</Label>
                <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Option 1, Option 2, Option 3" />
              </div>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
              <span className="text-sm">Required field</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name}>
              {editId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
