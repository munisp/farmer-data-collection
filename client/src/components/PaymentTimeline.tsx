import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PaymentSchedule {
  id: number;
  paymentNumber: number;
  dueDate: Date;
  paidDate?: Date | null;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  paidAmount: number;
  status: 'pending' | 'paid' | 'overdue';
  paymentMethod?: string | null;
}

interface PaymentTimelineProps {
  payments: PaymentSchedule[];
  loanNumber: string;
}

export function PaymentTimeline({ payments, loanNumber }: PaymentTimelineProps) {
  const formatCurrency = (amountInCents: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amountInCents / 100);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'overdue':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-500">Paid</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getDaysUntilDue = (dueDate: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const sortedPayments = [...payments].sort((a, b) => a.paymentNumber - b.paymentNumber);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Schedule</CardTitle>
        <CardDescription>
          Track your payment timeline for loan {loanNumber}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedPayments.map((payment, index) => {
            const isLast = index === sortedPayments.length - 1;
            const daysUntilDue = getDaysUntilDue(payment.dueDate);
            
            return (
              <div key={payment.id} className="relative">
                {/* Timeline line */}
                {!isLast && (
                  <div className="absolute left-[10px] top-[30px] h-full w-0.5 bg-border" />
                )}
                
                <div className="flex gap-4">
                  {/* Status icon */}
                  <div className="relative z-10 flex-shrink-0">
                    {getStatusIcon(payment.status)}
                  </div>
                  
                  {/* Payment details */}
                  <div className="flex-1 pb-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">
                            Payment #{payment.paymentNumber}
                          </h4>
                          {getStatusBadge(payment.status)}
                        </div>
                        
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div>
                            <span className="font-medium">Due:</span> {formatDate(payment.dueDate)}
                            {payment.status === 'pending' && daysUntilDue >= 0 && (
                              <span className="ml-2 text-yellow-600">
                                ({daysUntilDue} {daysUntilDue === 1 ? 'day' : 'days'} remaining)
                              </span>
                            )}
                            {payment.status === 'pending' && daysUntilDue < 0 && (
                              <span className="ml-2 text-red-600">
                                ({Math.abs(daysUntilDue)} {Math.abs(daysUntilDue) === 1 ? 'day' : 'days'} overdue)
                              </span>
                            )}
                          </div>
                          
                          {payment.paidDate && (
                            <div>
                              <span className="font-medium">Paid:</span> {formatDate(payment.paidDate)}
                            </div>
                          )}
                          
                          {payment.paymentMethod && (
                            <div>
                              <span className="font-medium">Method:</span> {payment.paymentMethod}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right space-y-1">
                        <div className="font-semibold">
                          {formatCurrency(payment.totalAmount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Principal: {formatCurrency(payment.principalAmount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Interest: {formatCurrency(payment.interestAmount)}
                        </div>
                        {payment.paidAmount > 0 && payment.status !== 'paid' && (
                          <div className="text-xs text-green-600">
                            Paid: {formatCurrency(payment.paidAmount)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {sortedPayments.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No payment schedule available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
