import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ShoppingBasket, Calendar, Package, Pause, Play, X } from "lucide-react";

export default function SubscriptionBoxes() {
  const plans = trpc.subscription.listPlans.useQuery({ active: true });
  const mySubscriptions = trpc.subscription.getMySubscriptions.useQuery();
  const contracts = trpc.subscription.getContracts.useQuery();
  const standingOrders = trpc.subscription.getStandingOrders.useQuery();

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Subscriptions & Contracts</h1>
          <p className="text-muted-foreground">Produce subscription boxes, standing orders, and supply contracts</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ShoppingBasket className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{plans.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Available Plans</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{mySubscriptions.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">My Subscriptions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{standingOrders.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Standing Orders</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {(contracts.data?.asFarmer?.length || 0) + (contracts.data?.asBuyer?.length || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Supply Contracts</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subscription Plans</CardTitle>
            <CardDescription>Weekly/biweekly fresh produce boxes delivered to your door</CardDescription>
          </CardHeader>
          <CardContent>
            {plans.data && plans.data.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.data.map((plan: Record<string, unknown>) => (
                  <div key={plan.id as number} className="p-4 border rounded-lg space-y-3">
                    <h3 className="font-bold text-lg">{plan.name as string}</h3>
                    <p className="text-sm text-muted-foreground">{plan.description as string}</p>
                    <div className="flex items-center gap-2">
                      <Badge>{plan.category as string}</Badge>
                      <Badge variant="outline" className="capitalize">{plan.frequency as string}</Badge>
                    </div>
                    <p className="text-2xl font-bold">
                      {plan.currency as string} {plan.pricePerDelivery as number}
                      <span className="text-sm font-normal">/delivery</span>
                    </p>
                    <Button className="w-full">Subscribe</Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No subscription plans available yet</p>
            )}
          </CardContent>
        </Card>

        {mySubscriptions.data && mySubscriptions.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>My Active Subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mySubscriptions.data.map((sub: Record<string, unknown>) => (
                  <div key={sub.id as number} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Plan #{sub.planId as number}</p>
                      <p className="text-sm text-muted-foreground">
                        Since {new Date(sub.startDate as string).toLocaleDateString()} — {sub.paymentMethod as string}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                        {sub.status as string}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
