import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ReviewsListProps {
  sellerId: number;
}

export default function ReviewsList({ sellerId }: ReviewsListProps) {
  const { data: reviews, isLoading } = trpc.marketplace.getSellerReviews.useQuery({
    sellerId,
    limit: 20,
  });

  const { data: ratingData } = trpc.marketplace.getSellerRating.useQuery({ sellerId });

  if (isLoading) {
    return <div className="text-center py-8">Loading reviews...</div>;
  }

  if (!reviews || reviews.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No reviews yet. Be the first to review!
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {ratingData && ratingData.totalReviews > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold">{ratingData.averageRating}</div>
              <div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= Math.round(ratingData.averageRating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Based on {ratingData.totalReviews} {ratingData.totalReviews === 1 ? "review" : "reviews"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {reviews.map((review) => (
          <Card key={review.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= review.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
              </div>
              {review.comment && (
                <p className="text-sm text-foreground mt-2">{review.comment}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
