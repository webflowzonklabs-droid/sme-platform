"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
} from "@sme/ui";
import { trpc } from "@/trpc/client";
import { setSessionCookie } from "@/lib/auth";
import { slugify } from "@sme/shared";

export default function CreateTenantPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const createTenant = trpc.tenants.create.useMutation({
    onSuccess: async (data) => {
      await setSessionCookie(data.token);
      window.location.href = `/${data.tenant.slug}`;
    },
    onError: (err) => {
      setError(err.message);
      setLoading(false);
    },
  });

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    createTenant.mutate({
      name,
      slug: slug || slugify(name),
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">
          Create Organization
        </CardTitle>
        <CardDescription className="text-center">
          Set up your business on the platform
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="My Business"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                platform.com/
              </span>
              <Input
                id="slug"
                type="text"
                placeholder="my-business"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  setSlugEdited(true);
                }}
                required
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create Organization"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
