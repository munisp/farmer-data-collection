import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Users, Wallet, HandCoins, TrendingUp, Calendar, Shield } from "lucide-react";

export default function ChamaGroupLending() {
  const myGroups = trpc.chama.getMyGroups.useQuery();

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Chama / VSLA Groups</h1>
          <p className="text-muted-foreground">Village Savings & Loan Associations — pool savings, take loans with social collateral</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{myGroups.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">My Groups</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Wallet className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Total Savings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <HandCoins className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Active Loans</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>My Chama Groups</CardTitle>
            <CardDescription>Savings circles you belong to</CardDescription>
          </CardHeader>
          <CardContent>
            {myGroups.isLoading ? (
              <p>Loading groups...</p>
            ) : myGroups.data && myGroups.data.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myGroups.data.map((group: Record<string, unknown>) => (
                  <div key={group.id as number} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg">{group.name as string}</h3>
                      <Badge>{group.myRole as string}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{group.description as string || "No description"}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span className="capitalize">{group.contributionFrequency as string}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Wallet className="h-4 w-4" />
                        <span>{group.currency as string} {group.contributionAmount as number}/period</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">View Details</Button>
                      <Button size="sm">Make Contribution</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">You haven't joined any Chama groups yet</p>
                <Button className="mt-4">Create a Group</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
