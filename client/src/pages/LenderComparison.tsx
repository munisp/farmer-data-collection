import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Award, Clock, DollarSign, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function LenderComparison() {
  const [selectedLenderIds, setSelectedLenderIds] = useState<number[]>([]);

  const { data: allLenders, isLoading: lendersLoading } = trpc.microfinance.getAllLenders.useQuery();
  const { data: comparisonData, isLoading: comparisonLoading } = trpc.microfinance.getLenderComparison.useQuery(
    { lenderIds: selectedLenderIds },
    { enabled: selectedLenderIds.length >= 2 }
  );

  const handleLenderToggle = (lenderId: number) => {
    setSelectedLenderIds((prev) => {
      if (prev.includes(lenderId)) {
        return prev.filter((id) => id !== lenderId);
      } else {
        if (prev.length >= 5) {
          toast.error("You can compare up to 5 lenders at a time");
          return prev;
        }
        return [...prev, lenderId];
      }
    });
  };

  const getBestValue = (key: keyof NonNullable<typeof comparisonData>[0], minimize = false) => {
    if (!comparisonData || comparisonData.length === 0) return null;

    const values = comparisonData.map((l) => l[key] as number).filter((v) => v !== undefined && v !== null);
    if (values.length === 0) return null;

    return minimize ? Math.min(...values) : Math.max(...values);
  };

  const isBestValue = (value: number, key: keyof NonNullable<typeof comparisonData>[0], minimize = false) => {
    const bestValue = getBestValue(key, minimize);
    return bestValue !== null && value === bestValue;
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Lender Performance Comparison</h1>
          <p className="text-muted-foreground">Compare lenders side-by-side to find the best fit for your needs</p>
        </div>

        {/* Lender Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Lenders to Compare</CardTitle>
            <CardDescription>Choose 2-5 lenders to compare their performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            {lendersLoading ? (
              <p>Loading lenders...</p>
            ) : !allLenders || allLenders.length === 0 ? (
              <p className="text-muted-foreground">No lenders available</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {allLenders.map((lender) => (
                  <div
                    key={lender.id}
                    className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                      selectedLenderIds.includes(lender.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      id={`lender-${lender.id}`}
                      checked={selectedLenderIds.includes(lender.id)}
                      onCheckedChange={() => handleLenderToggle(lender.id)}
                    />
                    <label htmlFor={`lender-${lender.id}`} className="flex-1 cursor-pointer">
                      <div className="font-medium">{lender.name}</div>
                      <div className="text-sm text-muted-foreground">{lender.type}</div>
                      {lender.interestRateRange && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Interest: {lender.interestRateRange}
                        </div>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 text-sm text-muted-foreground">
              Selected: {selectedLenderIds.length} / 5 lenders
            </div>
          </CardContent>
        </Card>

        {/* Comparison Results */}
        {selectedLenderIds.length >= 2 && (
          <>
            {comparisonLoading ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center">Loading comparison data...</p>
                </CardContent>
              </Card>
            ) : !comparisonData || comparisonData.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">No comparison data available</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Quick Comparison Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Best Approval Rate</CardTitle>
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const best = comparisonData.reduce((prev, curr) =>
                          curr.approvalRate > prev.approvalRate ? curr : prev
                        );
                        return (
                          <>
                            <div className="text-2xl font-bold">{best.approvalRate}%</div>
                            <p className="text-xs text-muted-foreground">{best.name}</p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Fastest Processing</CardTitle>
                      <Clock className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const fastest = comparisonData.reduce((prev, curr) =>
                          curr.avgProcessingTime < prev.avgProcessingTime ? curr : prev
                        );
                        return (
                          <>
                            <div className="text-2xl font-bold">{fastest.avgProcessingTime} days</div>
                            <p className="text-xs text-muted-foreground">{fastest.name}</p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Most Active</CardTitle>
                      <Award className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const mostActive = comparisonData.reduce((prev, curr) =>
                          curr.totalLoans > prev.totalLoans ? curr : prev
                        );
                        return (
                          <>
                            <div className="text-2xl font-bold">{mostActive.totalLoans}</div>
                            <p className="text-xs text-muted-foreground">{mostActive.name}</p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Highest Disbursed</CardTitle>
                      <DollarSign className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const highest = comparisonData.reduce((prev, curr) =>
                          curr.totalDisbursed > prev.totalDisbursed ? curr : prev
                        );
                        return (
                          <>
                            <div className="text-2xl font-bold">₦{(highest.totalDisbursed / 1000000).toFixed(1)}M</div>
                            <p className="text-xs text-muted-foreground">{highest.name}</p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>

                {/* Detailed Comparison Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Detailed Comparison</CardTitle>
                    <CardDescription>Side-by-side metrics for selected lenders</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table role="table" aria-label="Data table" className="w-full">
                        <thead role="rowgroup">
                          <tr className="border-b">
                            <th className="pb-3 text-left font-medium">Metric</th>
                            {comparisonData.map((lender) => (
                              <th key={lender.id} className="pb-3 text-left font-medium">
                                {lender.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody role="rowgroup">
                          {/* Lender Type */}
                          <tr className="border-b">
                            <td className="py-3 font-medium">Type</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                <Badge variant="outline">{lender.type}</Badge>
                              </td>
                            ))}
                          </tr>

                          {/* Interest Rate Range */}
                          <tr className="border-b">
                            <td className="py-3 font-medium">Interest Rate Range</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                {lender.interestRateRange ? (
                                  <div className="flex items-center gap-2">
                                    <span>
                                      {lender.interestRateRange}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">N/A</span>
                                )}
                              </td>
                            ))}
                          </tr>

                          {/* Total Loans */}
                          <tr className="border-b">
                            <td className="py-3 font-medium">Total Loans Processed</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                <div className="flex items-center gap-2">
                                  <span>{lender.totalLoans}</span>
                                  {isBestValue(lender.totalLoans, "totalLoans") && (
                                    <Badge variant="default" className="bg-yellow-600">
                                      <Award className="mr-1 h-3 w-3" />
                                      Most
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>

                          {/* Approval Rate */}
                          <tr className="border-b">
                            <td className="py-3 font-medium">Approval Rate</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                <div className="flex items-center gap-2">
                                  <span>{lender.approvalRate}%</span>
                                  {isBestValue(lender.approvalRate, "approvalRate") && (
                                    <Badge variant="default" className="bg-green-600">
                                      <TrendingUp className="mr-1 h-3 w-3" />
                                      Highest
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>

                          {/* Average Processing Time */}
                          <tr className="border-b">
                            <td className="py-3 font-medium">Avg. Processing Time</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                <div className="flex items-center gap-2">
                                  <span>{lender.avgProcessingTime} days</span>
                                  {isBestValue(lender.avgProcessingTime, "avgProcessingTime", true) && (
                                    <Badge variant="default" className="bg-blue-600">
                                      <Clock className="mr-1 h-3 w-3" />
                                      Fastest
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>

                          {/* Total Disbursed */}
                          <tr className="border-b">
                            <td className="py-3 font-medium">Total Amount Disbursed</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                <div className="flex items-center gap-2">
                                  <span>₦{lender.totalDisbursed.toLocaleString()}</span>
                                  {isBestValue(lender.totalDisbursed, "totalDisbursed") && (
                                    <Badge variant="default" className="bg-purple-600">
                                      <DollarSign className="mr-1 h-3 w-3" />
                                      Highest
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>

                          {/* Contact Information */}
                          <tr className="border-b">
                            <td className="py-3 font-medium">Contact</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                <div className="space-y-1 text-sm">
                                  {lender.email && <div>{lender.email}</div>}
                                  {lender.phoneNumber && <div>{lender.phoneNumber}</div>}
                                </div>
                              </td>
                            ))}
                          </tr>

                          {/* Address */}
                          <tr>
                            <td className="py-3 font-medium">Address</td>
                            {comparisonData.map((lender) => (
                              <td key={lender.id} className="py-3">
                                <div className="text-sm text-muted-foreground">
                                  {lender.address || "N/A"}
                                </div>
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}

        {selectedLenderIds.length < 2 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-lg font-medium">Select at least 2 lenders to start comparing</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose lenders from the list above to see detailed performance metrics
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
