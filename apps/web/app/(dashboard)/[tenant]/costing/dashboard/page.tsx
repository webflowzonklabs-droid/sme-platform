"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
} from "@sme/ui";
import { BarChart3, TrendingUp, AlertTriangle, Search } from "lucide-react";
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

function cogsBadge(pct: number): "default" | "secondary" | "destructive" {
  if (pct < 30) return "default";
  if (pct <= 40) return "secondary";
  return "destructive";
}

export default function CostingDashboardPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;

  const { data: summary, isLoading } = trpc.costing.dashboard.getCostingSummary.useQuery();
  const { data: inventoryItems } = trpc.costing.inventory.list.useQuery({});

  // Price impact state
  const [selectedItemId, setSelectedItemId] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const { data: impactData } = trpc.costing.costing.priceImpactAnalysis.useQuery(
    { itemId: selectedItemId, newPricePerUnit: newPrice },
    { enabled: !!selectedItemId && !!newPrice && newPrice !== "0" }
  );

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading dashboard...</div>;
  }

  const products = summary ?? [];
  const totalRecipes = products.length;
  const avgCogs = totalRecipes > 0
    ? products.reduce((sum, p) => sum + Number(p.cogsPct ?? 0), 0) / totalRecipes
    : 0;
  const needsAttention = products.filter((p) => Number(p.cogsPct ?? 0) > 40).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Costing Dashboard</h1>
        <p className="text-muted-foreground">Overview of recipe costs and profitability</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Final Products</p>
                <p className="text-2xl font-bold">{totalRecipes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average COGS%</p>
                <p className={`text-2xl font-bold ${cogsColor(avgCogs)}`}>{avgCogs.toFixed(2)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Needs Attention (&gt;40%)</p>
                <p className="text-2xl font-bold text-destructive">{needsAttention}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Final Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Final Products COGS</CardTitle>
          <CardDescription>All final products with cost breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          {products.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Selling Price</TableHead>
                  <TableHead className="text-right">Cost/gram</TableHead>
                  <TableHead className="text-right">COGS%</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const pct = Number(p.cogsPct ?? 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(p.totalCost)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(p.sellingPrice)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {p.costPerGram ? `₱${Number(p.costPerGram).toFixed(4)}` : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${cogsColor(pct)}`}>
                        {fmtPct(p.cogsPct)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cogsBadge(pct)}>
                          {pct < 30 ? "Good" : pct <= 40 ? "Watch" : "High"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No final products yet</p>
          )}
        </CardContent>
      </Card>

      {/* Price Impact Simulator */}
      <Card>
        <CardHeader>
          <CardTitle>Price Impact Simulator</CardTitle>
          <CardDescription>See how a price change affects your recipes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Ingredient</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
              >
                <option value="">Choose an ingredient...</option>
                {inventoryItems?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.brand ? ` (${item.brand})` : ""} — current: ₱{Number(item.currentPricePerUnit ?? 0).toFixed(4)}/unit
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>New Price Per Unit</Label>
              <Input
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0.000000"
                type="number"
                step="0.000001"
                min="0"
              />
            </div>
          </div>

          {impactData && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Item: <strong>{impactData.itemName}</strong></span>
                <span className="text-muted-foreground">Old: ₱{Number(impactData.oldPricePerUnit).toFixed(6)}</span>
                <span className="text-muted-foreground">New: ₱{Number(impactData.newPricePerUnit).toFixed(6)}</span>
                <span className={Number(impactData.priceDifference) > 0 ? "text-red-600" : "text-green-600"}>
                  Diff: {Number(impactData.priceDifference) > 0 ? "+" : ""}₱{Number(impactData.priceDifference).toFixed(6)}
                </span>
              </div>

              {impactData.affectedRecipes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipe</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Old Cost</TableHead>
                      <TableHead className="text-right">New Cost</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead className="text-right">Old COGS%</TableHead>
                      <TableHead className="text-right">New COGS%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {impactData.affectedRecipes.map((r: any) => (
                      <TableRow key={r.recipeId}>
                        <TableCell className="font-medium">{r.recipeName}</TableCell>
                        <TableCell><Badge variant="outline">{r.recipeType}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.oldTotalCost)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.newTotalCost)}</TableCell>
                        <TableCell className={`text-right font-mono ${Number(r.costDifference) > 0 ? "text-red-600" : "text-green-600"}`}>
                          {Number(r.costDifference) > 0 ? "+" : ""}{fmt(r.costDifference)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{r.oldCogsPct ? fmtPct(r.oldCogsPct) : "—"}</TableCell>
                        <TableCell className={`text-right font-mono ${r.newCogsPct ? cogsColor(Number(r.newCogsPct)) : ""}`}>
                          {r.newCogsPct ? fmtPct(r.newCogsPct) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No recipes are affected by this ingredient.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
