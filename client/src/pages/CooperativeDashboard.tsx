import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Users, MapPin, TrendingUp, Wallet, BarChart3, Wheat } from "lucide-react";

export default function CooperativeDashboard() {
  const { formatCurrency } = useLocalization();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: proposals } = trpc.cooperativeGovernance.listProposals.useQuery(
    { cooperativeId: 1 },
    { retry: 1, refetchOnWindowFocus: false }
  );

  const openProposals = proposals?.filter((p: any) => p.status === "open").length ?? 0;

  const coopData = {
    name: "Oyo Farmers Cooperative Union",
    members: 156,
    totalFarms: 89,
    totalHectares: 412.5,
    activeLoanPortfolio: 8_750_000,
    totalSales: 23_450_000,
    avgCreditScore: 72,
    regions: ["Ibadan", "Oyo", "Ogbomoso", "Iseyin"],
    activeProposals: openProposals,
  };

  const memberBreakdown = [
    { crop: "Cassava", farmers: 42, hectares: 125.3, production: "2,100 tons", revenue: 6_500_000 },
    { crop: "Rice (FARO 44)", farmers: 28, hectares: 84.0, production: "420 tons", revenue: 5_200_000 },
    { crop: "Cocoa", farmers: 22, hectares: 66.0, production: "132 tons", revenue: 4_800_000 },
    { crop: "Yam", farmers: 18, hectares: 45.0, production: "900 tons", revenue: 3_600_000 },
    { crop: "Oil Palm", farmers: 15, hectares: 52.2, production: "520 tons", revenue: 2_350_000 },
    { crop: "Groundnut", farmers: 12, hectares: 24.0, production: "72 tons", revenue: 600_000 },
    { crop: "Plantain", farmers: 10, hectares: 8.0, production: "160 bunches", revenue: 240_000 },
    { crop: "Maize", farmers: 9, hectares: 8.0, production: "32 tons", revenue: 160_000 },
  ];

  const loanPortfolio = [
    { type: "Input Loans", count: 45, total: 3_200_000, defaultRate: 4.2 },
    { type: "Equipment Loans", count: 12, total: 2_800_000, defaultRate: 2.1 },
    { type: "Land Expansion", count: 8, total: 1_750_000, defaultRate: 6.5 },
    { type: "Storage Facility", count: 5, total: 1_000_000, defaultRate: 0.0 },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 dark:bg-slate-900 min-h-screen" role="main" aria-label="Cooperative Dashboard">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{coopData.name}</h1>
        <p className="text-gray-500 dark:text-gray-400">Cooperative aggregate reporting dashboard</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Cooperative summary">
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-blue-500" aria-hidden="true" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Members</span>
            </div>
            <p className="text-2xl font-bold dark:text-white">{coopData.members}</p>
            <p className="text-xs text-gray-400">{coopData.totalFarms} farms</p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-green-500" aria-hidden="true" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Total Area</span>
            </div>
            <p className="text-2xl font-bold dark:text-white">{coopData.totalHectares} ha</p>
            <p className="text-xs text-gray-400">{coopData.regions.length} regions</p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Total Sales</span>
            </div>
            <p className="text-2xl font-bold dark:text-white">{formatCurrency(coopData.totalSales)}</p>
            <p className="text-xs text-gray-400">This season</p>
          </CardContent>
        </Card>
        <Card className="dark:bg-slate-800 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-5 w-5 text-orange-500" aria-hidden="true" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Loan Portfolio</span>
            </div>
            <p className="text-2xl font-bold dark:text-white">{formatCurrency(coopData.activeLoanPortfolio)}</p>
            <p className="text-xs text-gray-400">Avg score: {coopData.avgCreditScore}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="dark:bg-slate-800" aria-label="Dashboard sections">
          <TabsTrigger value="overview">Production</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <Wheat className="h-5 w-5" aria-hidden="true" />
                Production by Crop
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table role="table" aria-label="Production breakdown by crop" className="w-full">
                  <thead role="rowgroup">
                    <tr className="border-b dark:border-slate-600">
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Crop</th>
                      <th className="text-right p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Farmers</th>
                      <th className="text-right p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Hectares</th>
                      <th className="text-right p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Production</th>
                      <th className="text-right p-3 text-sm font-medium text-gray-500 dark:text-gray-400" scope="col">Revenue</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {memberBreakdown.map((item) => (
                      <tr key={item.crop} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                        <td className="p-3 font-medium dark:text-white">{item.crop}</td>
                        <td className="p-3 text-right dark:text-gray-300">{item.farmers}</td>
                        <td className="p-3 text-right dark:text-gray-300">{item.hectares}</td>
                        <td className="p-3 text-right dark:text-gray-300">{item.production}</td>
                        <td className="p-3 text-right font-medium dark:text-white">{formatCurrency(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
                Loan Portfolio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loanPortfolio.map((loan) => (
                  <div key={loan.type} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-slate-700" role="listitem">
                    <div>
                      <p className="font-medium dark:text-white">{loan.type}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{loan.count} active loans</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold dark:text-white">{formatCurrency(loan.total)}</p>
                      <Badge variant={loan.defaultRate > 5 ? "destructive" : "secondary"}>
                        {loan.defaultRate}% default rate
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Regional Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {coopData.regions.map((r) => (
                  <div key={r} className="p-4 rounded-lg bg-gray-50 dark:bg-slate-700 text-center">
                    <MapPin className="h-6 w-6 mx-auto mb-2 text-green-500" aria-hidden="true" />
                    <p className="font-medium dark:text-white">{r}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{Math.floor(coopData.members / coopData.regions.length)} members</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
