"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sme/ui";
import { Plus, UserMinus } from "lucide-react";
import { trpc } from "@/trpc/client";

export default function MembersPage() {
  const { data: members, refetch } = trpc.users.list.useQuery({ limit: 50 });
  const { data: roles } = trpc.roles.list.useQuery();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [invitePin, setInvitePin] = useState("");

  const inviteUser = trpc.users.invite.useMutation({
    onSuccess: () => {
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRoleId("");
      setInvitePin("");
      refetch();
    },
  });

  const removeMember = trpc.users.removeMember.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">
            Manage your organization&apos;s team members
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Add a new member to your organization
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Full Name</Label>
                <Input
                  id="invite-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles?.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-pin">PIN Code (optional)</Label>
                <Input
                  id="invite-pin"
                  value={invitePin}
                  onChange={(e) => setInvitePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="4-6 digit PIN"
                  maxLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  For quick POS/kiosk login
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  inviteUser.mutate({
                    email: inviteEmail,
                    fullName: inviteName,
                    roleId: inviteRoleId,
                    pin: invitePin || undefined,
                  });
                }}
                disabled={
                  !inviteEmail || !inviteName || !inviteRoleId || inviteUser.isPending
                }
              >
                {inviteUser.isPending ? "Inviting..." : "Invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.data.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.fullName}
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{member.roleName}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={member.isActive ? "default" : "destructive"}
                    >
                      {member.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.roleSlug !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          removeMember.mutate({
                            membershipId: member.id,
                          })
                        }
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!members || members.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No members found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
