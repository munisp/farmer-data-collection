import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, ArrowRight, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export function PaymentSummaryWidget() {
  const { formatCurrency } = useLocalization();

  const stats = {
    totalVolume: 45890000,
    reconciled: 1198,
    pending: 34,
    mismatched: 15,
    rate: 96.1,
  };

  return (
    <Card className="shadow-lg dark:bg-gray-900" role="region" aria-label="Payment reconciliation summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-purple-600" />
            Payments
          </span>
          <a href="/payment-reconciliation">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              View <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-purple-700 dark:text-purple-400">
            {formatCurrency(stats.totalVolume)}
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-500">Total Volume</div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              Reconciled
            </span>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-xs">
              {stats.reconciled} ({stats.rate}%)
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-yellow-500" />
              Pending
            </span>
            <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 text-xs">
              {stats.pending}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              Mismatched
            </span>
            <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 text-xs">
              {stats.mismatched}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
