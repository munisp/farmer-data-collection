import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { FileText, Plus, Clock, CheckCircle2, XCircle, Eye } from "lucide-react";

/**
 * My Applications Page
 * 
 * Displays user's loan applications with status tracking
 */

export default function MyApplications() {
  const { data: applications, isLoading } = trpc.loanApplication.getMyApplications.useQuery();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "under_review":
        return <Badge variant="default" className="flex items-center gap-1"><Eye className="h-3 w-3" /> Under Review</Badge>;
      case "approved":
        return <Badge variant="default" className="flex items-center gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
      case "withdrawn":
        return <Badge variant="outline">Withdrawn</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading applications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Loan Applications</h1>
          <p className="text-muted-foreground">Track your loan application status</p>
        </div>
        <Link href="/apply-loan">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Application
          </Button>
        </Link>
      </div>

      {!applications || applications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Applications Yet</h3>
            <p className="text-muted-foreground mb-6">Start by submitting your first loan application</p>
            <Link href="/apply-loan">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Apply for a Loan
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {applications.map((app) => (
            <Card key={app.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Application #{app.applicationNumber}
                      {getStatusBadge(app.status)}
                    </CardTitle>
                    <CardDescription>
                      Submitted on {new Date(app.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <Link href={`/applications/${app.id}`}>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Loan Amount</p>
                    <p className="font-semibold">₦{(app.loanAmount / 100).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Term</p>
                    <p className="font-semibold">{app.termMonths} months</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Purpose</p>
                    <p className="font-semibold truncate">{app.purpose}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-semibold capitalize">{app.status.replace(/_/g, " ")}</p>
                  </div>
                </div>

                {app.status === "approved" && app.approvedAmount && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-800">
                      Approved Amount: ₦{(app.approvedAmount / 100).toLocaleString()}
                    </p>
                    {app.approvedInterestRate && (
                      <p className="text-sm text-green-700">
                        Interest Rate: {(app.approvedInterestRate / 100).toFixed(2)}%
                      </p>
                    )}
                  </div>
                )}

                {app.status === "rejected" && app.rejectionReason && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-800">Rejection Reason:</p>
                    <p className="text-sm text-red-700">{app.rejectionReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
