import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

interface ExtensionAgent {
  id: string; name: string; specialization: string[]; region: string; assignedFarms: number;
  rating: number; completedVisits: number; phone: string; available: boolean;
}

interface FarmVisit {
  id: string; agentId: string; farmerId: number; farmId: string; scheduledDate: string;
  status: string; type: string; findings: string; recommendations: string[];
  photosCount: number; followUpDate: string | null; duration: number;
}

const agents: ExtensionAgent[] = [
  { id: "AGT-001", name: "Dr. Aisha Mohammed", specialization: ["soil_science", "crop_nutrition"], region: "Ogun State", assignedFarms: 25, rating: 4.9, completedVisits: 180, phone: "+2348012345678", available: true },
  { id: "AGT-002", name: "Emmanuel Okafor", specialization: ["pest_management", "IPM"], region: "Kano State", assignedFarms: 30, rating: 4.7, completedVisits: 145, phone: "+2348023456789", available: true },
  { id: "AGT-003", name: "Wanjiku Kamau", specialization: ["aquaculture", "livestock"], region: "Kiambu County", assignedFarms: 18, rating: 4.8, completedVisits: 95, phone: "+254712345678", available: false },
  { id: "AGT-004", name: "Fatima Bello", specialization: ["irrigation", "water_management"], region: "Niger State", assignedFarms: 22, rating: 4.6, completedVisits: 120, phone: "+2348034567890", available: true },
  { id: "AGT-005", name: "Joseph Adeyemi", specialization: ["organic_farming", "certification"], region: "Oyo State", assignedFarms: 15, rating: 4.9, completedVisits: 200, phone: "+2348045678901", available: true },
];

const visits: FarmVisit[] = [
  { id: "VIS-001", agentId: "AGT-001", farmerId: 1001, farmId: "FARM-001", scheduledDate: "2026-05-20", status: "completed", type: "routine_inspection", findings: "Soil pH slightly acidic (5.8). Nitrogen deficiency observed in lower leaves.", recommendations: ["Apply lime at 2kg/acre", "Top-dress with urea at 50kg/ha", "Consider cover cropping next season"], photosCount: 5, followUpDate: "2026-06-20", duration: 45 },
  { id: "VIS-002", agentId: "AGT-002", farmerId: 1002, farmId: "FARM-002", scheduledDate: "2026-05-22", status: "completed", type: "pest_assessment", findings: "Fall armyworm infestation at early stage. Approximately 15% leaf damage.", recommendations: ["Apply Emamectin benzoate immediately", "Set up pheromone traps at field borders", "Scout daily for next 2 weeks", "Report to local plant protection office"], photosCount: 8, followUpDate: "2026-05-29", duration: 60 },
  { id: "VIS-003", agentId: "AGT-004", farmerId: 1003, farmId: "FARM-003", scheduledDate: "2026-05-28", status: "scheduled", type: "irrigation_assessment", findings: "", recommendations: [], photosCount: 0, followUpDate: null, duration: 0 },
  { id: "VIS-004", agentId: "AGT-005", farmerId: 1004, farmId: "FARM-004", scheduledDate: "2026-06-01", status: "scheduled", type: "organic_certification", findings: "", recommendations: [], photosCount: 0, followUpDate: null, duration: 0 },
];

const knowledgeBase = [
  { id: "KB-001", title: "Maize Nutrient Deficiency Guide", category: "crop_nutrition", crops: ["maize"], difficulty: "beginner", language: "en", views: 450, content: "Identify N, P, K deficiencies by leaf symptoms..." },
  { id: "KB-002", title: "Integrated Pest Management for Rice", category: "pest_management", crops: ["rice"], difficulty: "intermediate", language: "en", views: 320, content: "IPM strategies combining biological, cultural, and chemical control..." },
  { id: "KB-003", title: "Drip Irrigation Setup & Maintenance", category: "irrigation", crops: ["tomatoes", "vegetables"], difficulty: "intermediate", language: "en", views: 280, content: "Step-by-step guide to installing and maintaining drip systems..." },
  { id: "KB-004", title: "Organic Certification Process (Nigeria)", category: "certification", crops: ["all"], difficulty: "advanced", language: "en", views: 150, content: "Requirements for NAFDAC organic certification..." },
  { id: "KB-005", title: "Fish Pond Water Quality Management", category: "aquaculture", crops: ["fish"], difficulty: "intermediate", language: "en", views: 200, content: "Monitoring pH, DO, ammonia, and temperature..." },
];

export const extensionServicesRouter = router({
  listAgents: protectedProcedure
    .input(z.object({ region: z.string().optional(), specialization: z.string().optional(), available: z.boolean().optional() }).optional())
    .query(({ input }) => {
      let filtered = agents;
      if (input?.region) filtered = filtered.filter(a => a.region === input.region);
      if (input?.specialization) filtered = filtered.filter(a => a.specialization.includes(input.specialization!));
      if (input?.available !== undefined) filtered = filtered.filter(a => a.available === input.available);
      return filtered;
    }),

  scheduleVisit: protectedProcedure
    .input(z.object({ agentId: z.string(), farmerId: z.number(), farmId: z.string(), date: z.string(), type: z.string(), notes: z.string().optional() }))
    .mutation(({ input }) => {
      const agent = agents.find(a => a.id === input.agentId);
      if (!agent) return { success: false, error: "Agent not found" };
      if (!agent.available) return { success: false, error: "Agent not available" };

      const visit: FarmVisit = {
        id: `VIS-${String(visits.length + 1).padStart(3, "0")}`, agentId: input.agentId,
        farmerId: input.farmerId, farmId: input.farmId, scheduledDate: input.date,
        status: "scheduled", type: input.type, findings: "", recommendations: [],
        photosCount: 0, followUpDate: null, duration: 0,
      };
      visits.push(visit);
      logger.info("[ExtensionServices] Visit scheduled", { visitId: visit.id, agentId: input.agentId, farmerId: input.farmerId });
      return { success: true, visit };
    }),

  completeVisit: protectedProcedure
    .input(z.object({ visitId: z.string(), findings: z.string(), recommendations: z.array(z.string()), photosCount: z.number(), duration: z.number(), followUpDays: z.number().optional() }))
    .mutation(({ input }) => {
      const visit = visits.find(v => v.id === input.visitId);
      if (!visit) return { success: false, error: "Visit not found" };
      visit.status = "completed";
      visit.findings = input.findings;
      visit.recommendations = input.recommendations;
      visit.photosCount = input.photosCount;
      visit.duration = input.duration;
      if (input.followUpDays) visit.followUpDate = new Date(Date.now() + input.followUpDays * 86400000).toISOString().split("T")[0];
      const agent = agents.find(a => a.id === visit.agentId);
      if (agent) agent.completedVisits++;
      logger.info("[ExtensionServices] Visit completed", { visitId: input.visitId, recommendations: input.recommendations.length });
      return { success: true, visit };
    }),

  getVisitHistory: protectedProcedure
    .input(z.object({ farmerId: z.number().optional(), agentId: z.string().optional(), status: z.string().optional() }).optional())
    .query(({ input }) => {
      let filtered = visits;
      if (input?.farmerId) filtered = filtered.filter(v => v.farmerId === input.farmerId);
      if (input?.agentId) filtered = filtered.filter(v => v.agentId === input.agentId);
      if (input?.status) filtered = filtered.filter(v => v.status === input.status);
      return filtered;
    }),

  searchKnowledge: publicProcedure
    .input(z.object({ query: z.string().optional(), category: z.string().optional(), crop: z.string().optional(), difficulty: z.string().optional() }).optional())
    .query(({ input }) => {
      let filtered = knowledgeBase;
      if (input?.category) filtered = filtered.filter(k => k.category === input.category);
      if (input?.crop) filtered = filtered.filter(k => k.crops.includes(input.crop!) || k.crops.includes("all"));
      if (input?.difficulty) filtered = filtered.filter(k => k.difficulty === input.difficulty);
      if (input?.query) { const q = input.query.toLowerCase(); filtered = filtered.filter(k => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q)); }
      return filtered.map(k => ({ id: k.id, title: k.title, category: k.category, crops: k.crops, difficulty: k.difficulty, views: k.views }));
    }),

  getAgentDashboard: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(({ input }) => {
      const agent = agents.find(a => a.id === input.agentId);
      if (!agent) return null;
      const agentVisits = visits.filter(v => v.agentId === input.agentId);
      const scheduled = agentVisits.filter(v => v.status === "scheduled");
      const completed = agentVisits.filter(v => v.status === "completed");
      const avgDuration = completed.length > 0 ? Math.round(completed.reduce((s, v) => s + v.duration, 0) / completed.length) : 0;
      return { agent, scheduled: scheduled.length, completedThisMonth: completed.length, averageDuration: avgDuration, nextVisit: scheduled[0] || null, totalRecommendations: completed.reduce((s, v) => s + v.recommendations.length, 0) };
    }),
});
