import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ReviewFormProps {
  orderId: number;
  revieweeId: number;
  reviewType: "buyer_to_seller" | "seller_to_buyer";
  onSuccess?: () => void;
}

export default function ReviewForm({ orderId, revieweeId, reviewType, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");

  const createReviewMutation = trpc.marketplace.createReview.useMutation({
    onSuccess: () => {
      toast.success("Review submitted successfully!");
      setRating(0);
      setComment("");
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    createReviewMutation.mutate({
      orderId,
      revieweeId,
      rating,
      comment: comment.trim() || undefined,
      reviewType,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave a Review</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="comment" className="block text-sm font-medium mb-2">
              Comment (optional)
            </label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              rows={4}
            />
          </div>

          <Button
            type="submit"
            disabled={createReviewMutation.isPending || rating === 0}
            className="w-full"
          >
            {createReviewMutation.isPending ? "Submitting..." : "Submit Review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
