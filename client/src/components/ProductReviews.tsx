import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/StarRating";
import { ThumbsUp, ThumbsDown, CheckCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Review {
  id: number;
  userId: number;
  userName: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  createdAt: string;
}

interface ProductReviewsProps {
  listingId: number;
  reviews: Review[];
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export function ProductReviews({
  reviews,
  averageRating,
  totalReviews,
  ratingDistribution,
}: ProductReviewsProps) {
  const [sortBy, setSortBy] = useState<"recent" | "helpful">("recent");

  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortBy === "helpful") {
      return b.helpfulCount - a.helpfulCount;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getRatingPercentage = (count: number) => {
    return totalReviews > 0 ? (count / totalReviews) * 100 : 0;
  };

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Overall Rating */}
            <div className="text-center">
              <div className="text-5xl font-bold mb-2">{averageRating.toFixed(1)}</div>
              <StarRating rating={Math.round(averageRating)} size="lg" readonly />
              <p className="text-sm text-muted-foreground mt-2">
                Based on {totalReviews} {totalReviews === 1 ? "review" : "reviews"}
              </p>
            </div>

            {/* Rating Distribution */}
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = ratingDistribution[stars as keyof typeof ratingDistribution];
                const percentage = getRatingPercentage(count);

                return (
                  <div key={stars} className="flex items-center gap-2">
                    <span className="text-sm font-medium w-8">{stars} ★</span>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviews List */}
      <div className="space-y-4">
        {/* Sort Options */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {totalReviews} {totalReviews === 1 ? "Review" : "Reviews"}
          </h3>
          <div className="flex gap-2">
            <Button
              variant={sortBy === "recent" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("recent")}
            >
              Most Recent
            </Button>
            <Button
              variant={sortBy === "helpful" ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy("helpful")}
            >
              Most Helpful
            </Button>
          </div>
        </div>

        {/* Review Cards */}
        {sortedReviews.length > 0 ? (
          <div className="space-y-4">
            {sortedReviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{review.userName}</span>
                          {review.verifiedPurchase && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Verified Purchase
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(review.createdAt)}
                        </p>
                      </div>
                      <StarRating rating={review.rating} readonly size="sm" />
                    </div>

                    {/* Title */}
                    {review.title && (
                      <h4 className="font-semibold text-lg">{review.title}</h4>
                    )}

                    {/* Comment */}
                    <p className="text-muted-foreground">{review.comment}</p>

                    {/* Helpful Buttons */}
                    <div className="flex items-center gap-4 pt-2 border-t">
                      <span className="text-sm text-muted-foreground">Was this helpful?</span>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <ThumbsUp className="w-4 h-4" />
                        Helpful ({review.helpfulCount})
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <ThumbsDown className="w-4 h-4" />
                        ({review.unhelpfulCount})
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
              <p className="text-muted-foreground">
                Be the first to review this product!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
