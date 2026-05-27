import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";

/**
 * Response Templates Router
 * Pre-built templates for seller responses to speed up engagement
 */

export interface ResponseTemplate {
  id: string;
  category: string;
  title: string;
  template: string;
  variables: string[];
  usage: number;
}

// Pre-built response templates
const DEFAULT_TEMPLATES: ResponseTemplate[] = [
  // Thank You Templates
  {
    id: "thank_positive",
    category: "Thank You",
    title: "Thank You for Positive Review",
    template: "Thank you so much for your kind words, {{customerName}}! We're thrilled to hear that you enjoyed our {{productName}}. Your satisfaction is our top priority, and we look forward to serving you again soon!",
    variables: ["customerName", "productName"],
    usage: 0,
  },
  {
    id: "thank_verified",
    category: "Thank You",
    title: "Thank You (Verified Purchase)",
    template: "Thank you for choosing us and for taking the time to leave this review! We're so glad you're happy with your {{productName}}. We appreciate your business and hope to see you again!",
    variables: ["productName"],
    usage: 0,
  },
  {
    id: "thank_photos",
    category: "Thank You",
    title: "Thank You for Photos",
    template: "Thank you for the wonderful review and photos! We love seeing how our customers enjoy our {{productName}}. Your feedback helps other shoppers make informed decisions. We appreciate you!",
    variables: ["productName"],
    usage: 0,
  },

  // Apology Templates
  {
    id: "apology_quality",
    category: "Apology",
    title: "Apology for Quality Issue",
    template: "We sincerely apologize for your experience with our {{productName}}. This doesn't meet our quality standards. Please contact us directly at {{contactEmail}} so we can make this right with a replacement or refund. Your satisfaction matters to us.",
    variables: ["productName", "contactEmail"],
    usage: 0,
  },
  {
    id: "apology_delivery",
    category: "Apology",
    title: "Apology for Delivery Issue",
    template: "We're sorry to hear about the delivery issue with your order. We understand how frustrating this must be. Please reach out to us at {{contactEmail}} with your order number, and we'll resolve this immediately. Thank you for your patience.",
    variables: ["contactEmail"],
    usage: 0,
  },
  {
    id: "apology_general",
    category: "Apology",
    title: "General Apology",
    template: "We apologize that your experience didn't meet your expectations. We take all feedback seriously and would love the opportunity to make things right. Please contact us at {{contactEmail}} so we can address your concerns personally.",
    variables: ["contactEmail"],
    usage: 0,
  },

  // Clarification Templates
  {
    id: "clarify_product",
    category: "Clarification",
    title: "Product Clarification",
    template: "Thank you for your feedback! We'd like to clarify that our {{productName}} {{clarification}}. We appreciate you bringing this to our attention and hope this information is helpful. Please feel free to reach out if you have any questions!",
    variables: ["productName", "clarification"],
    usage: 0,
  },
  {
    id: "clarify_usage",
    category: "Clarification",
    title: "Usage Instructions",
    template: "Thank you for your review! For best results with our {{productName}}, we recommend {{instructions}}. We hope this helps! If you have any questions, please don't hesitate to contact us at {{contactEmail}}.",
    variables: ["productName", "instructions", "contactEmail"],
    usage: 0,
  },

  // Follow-Up Templates
  {
    id: "followup_issue",
    category: "Follow-Up",
    title: "Follow-Up on Issue",
    template: "Thank you for bringing this to our attention. We've taken steps to address the issue you mentioned. We'd love to hear from you again to ensure everything is resolved to your satisfaction. Please contact us at {{contactEmail}}.",
    variables: ["contactEmail"],
    usage: 0,
  },
  {
    id: "followup_improvement",
    category: "Follow-Up",
    title: "Thank You for Improvement Suggestion",
    template: "Thank you for your thoughtful feedback! We're always looking for ways to improve, and suggestions like yours help us serve our customers better. We've shared your feedback with our team and will consider it for future improvements.",
    variables: [],
    usage: 0,
  },

  // Neutral Response Templates
  {
    id: "neutral_moderate",
    category: "Neutral",
    title: "Response to Moderate Review",
    template: "Thank you for your honest feedback about our {{productName}}. We're glad you found some aspects satisfactory, and we're always working to improve. If there's anything specific we can do better, please let us know at {{contactEmail}}.",
    variables: ["productName", "contactEmail"],
    usage: 0,
  },
  {
    id: "neutral_mixed",
    category: "Neutral",
    title: "Response to Mixed Review",
    template: "Thank you for taking the time to share your experience. We're happy you enjoyed {{positiveAspect}}, and we appreciate your feedback about {{negativeAspect}}. We're constantly working to improve and hope to serve you better in the future!",
    variables: ["positiveAspect", "negativeAspect"],
    usage: 0,
  },
];

export const responseTemplatesRouter = router({
  /**
   * Get all available templates
   */
  getTemplates: protectedProcedure.query(async () => {
    return DEFAULT_TEMPLATES;
  }),

  /**
   * Get templates by category
   */
  getTemplatesByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      return DEFAULT_TEMPLATES.filter(t => t.category === input.category);
    }),

  /**
   * Get template categories
   */
  getCategories: protectedProcedure.query(async () => {
    const categories = Array.from(new Set(DEFAULT_TEMPLATES.map(t => t.category)));
    return categories.map(category => ({
      name: category,
      count: DEFAULT_TEMPLATES.filter(t => t.category === category).length,
    }));
  }),

  /**
   * Fill template with variables
   */
  fillTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        variables: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const template = DEFAULT_TEMPLATES.find(t => t.id === input.templateId);
      if (!template) {
        throw new Error("Template not found");
      }

      let filled: string = template.template;
      for (const [key, value] of Object.entries(input.variables)) {
        const regex = new RegExp(`\{\{${key}\}\}`, 'g');
        filled = filled.replace(regex, value as string);
      }

      // Track usage (in production, this would update a database)
      template.usage++;

      return {
        text: filled,
        remainingVariables: template.variables.filter(
          v => !input.variables[v]
        ),
      };
    }),

  /**
   * Get most used templates
   */
  getPopularTemplates: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ input }) => {
      return [...DEFAULT_TEMPLATES]
        .sort((a, b) => b.usage - a.usage)
        .slice(0, input.limit);
    }),

  /**
   * Search templates
   */
  searchTemplates: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const query = input.query.toLowerCase();
      return DEFAULT_TEMPLATES.filter(
        t =>
          t.title.toLowerCase().includes(query) ||
          t.template.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query)
      );
    }),
});
