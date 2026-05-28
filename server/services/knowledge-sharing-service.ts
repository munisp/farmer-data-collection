/**
 * Farmer-to-Farmer Knowledge Sharing Service
 * Community forums, success stories, expert Q&A, and peer learning
 * Integrates with user profiles and gamification
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from '../logger.js';
const kafkaProducer = { send: async (payload: Record<string, any>) => { const p = await getProducer(); if (p) return p.send(payload as any); } };

export type ContentType = 'question' | 'answer' | 'tip' | 'success_story' | 'tutorial' | 'discussion';
export type ContentStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface ForumPost {
  id: string;
  authorId: number;
  authorName: string;
  authorAvatar?: string;
  authorBadges: string[];
  type: ContentType;
  title: string;
  content: string;
  category: ForumCategory;
  tags: string[];
  images?: string[];
  videos?: string[];
  location?: { state: string; lga: string };
  crops?: string[];
  upvotes: number;
  downvotes: number;
  viewCount: number;
  commentCount: number;
  isAnswered?: boolean;
  acceptedAnswerId?: string;
  isPinned: boolean;
  isFeatured: boolean;
  status: ContentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ForumCategory = 
  | 'crop_farming'
  | 'livestock'
  | 'pest_disease'
  | 'market_prices'
  | 'equipment'
  | 'finance'
  | 'weather'
  | 'storage'
  | 'organic_farming'
  | 'irrigation'
  | 'general';

export interface Comment {
  id: string;
  postId: string;
  parentId?: string;
  authorId: number;
  authorName: string;
  authorBadges: string[];
  content: string;
  images?: string[];
  upvotes: number;
  downvotes: number;
  isAcceptedAnswer: boolean;
  isExpertAnswer: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuccessStory {
  id: string;
  farmerId: number;
  farmerName: string;
  farmerPhoto?: string;
  title: string;
  summary: string;
  fullStory: string;
  challenge: string;
  solution: string;
  results: StoryResult[];
  crops: string[];
  location: { state: string; lga: string };
  farmSize: number;
  images: string[];
  videoUrl?: string;
  practicesUsed: string[];
  lessonsLearned: string[];
  viewCount: number;
  likeCount: number;
  shareCount: number;
  isFeatured: boolean;
  isVerified: boolean;
  verifiedBy?: string;
  createdAt: Date;
}

export interface StoryResult {
  metric: string;
  before: string;
  after: string;
  improvement: string;
}

export interface Expert {
  id: string;
  userId: number;
  name: string;
  photo?: string;
  title: string;
  organization: string;
  specializations: string[];
  bio: string;
  qualifications: string[];
  yearsExperience: number;
  rating: number;
  totalAnswers: number;
  acceptedAnswers: number;
  isAvailable: boolean;
  responseTime: string;
  languages: string[];
  contactPreference: 'forum' | 'call' | 'video' | 'all';
}

export interface ExpertSession {
  id: string;
  expertId: string;
  farmerId: number;
  topic: string;
  description: string;
  sessionType: 'text' | 'voice' | 'video';
  scheduledAt: Date;
  duration: number; // minutes
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  rating?: number;
  feedback?: string;
  notes?: string;
}

export interface FarmerProfile {
  farmerId: number;
  displayName: string;
  avatar?: string;
  bio?: string;
  location: { state: string; lga: string };
  farmSize: number;
  crops: string[];
  yearsExperience: number;
  badges: Badge[];
  points: number;
  level: number;
  postsCount: number;
  answersCount: number;
  acceptedAnswersCount: number;
  helpfulVotesReceived: number;
  followersCount: number;
  followingCount: number;
  joinedAt: Date;
  lastActiveAt: Date;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'contribution' | 'expertise' | 'community' | 'achievement';
  earnedAt: Date;
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours: number;
  modules: LearningModule[];
  enrolledCount: number;
  completionRate: number;
  rating: number;
}

export interface LearningModule {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'article' | 'quiz' | 'practical';
  duration: number; // minutes
  content: string;
  resources: string[];
  order: number;
}

export interface FarmerProgress {
  farmerId: number;
  pathId: string;
  completedModules: string[];
  currentModule: string;
  progress: number;
  startedAt: Date;
  lastActivityAt: Date;
  certificateUrl?: string;
}

// Badge definitions
const BADGES: Badge[] = [
  { id: 'first_post', name: 'First Post', description: 'Created your first forum post', icon: '📝', category: 'contribution', earnedAt: new Date() },
  { id: 'helpful_10', name: 'Helpful Farmer', description: 'Received 10 helpful votes', icon: '👍', category: 'community', earnedAt: new Date() },
  { id: 'helpful_50', name: 'Community Helper', description: 'Received 50 helpful votes', icon: '🌟', category: 'community', earnedAt: new Date() },
  { id: 'helpful_100', name: 'Knowledge Champion', description: 'Received 100 helpful votes', icon: '🏆', category: 'community', earnedAt: new Date() },
  { id: 'expert_answer', name: 'Expert Contributor', description: 'Had an answer accepted by an expert', icon: '✅', category: 'expertise', earnedAt: new Date() },
  { id: 'success_story', name: 'Storyteller', description: 'Shared a verified success story', icon: '📖', category: 'achievement', earnedAt: new Date() },
  { id: 'mentor', name: 'Mentor', description: 'Helped 10 new farmers', icon: '🎓', category: 'community', earnedAt: new Date() },
  { id: 'crop_expert', name: 'Crop Expert', description: 'Recognized expertise in a specific crop', icon: '🌾', category: 'expertise', earnedAt: new Date() },
  { id: 'pest_warrior', name: 'Pest Warrior', description: 'Provided 20 pest/disease solutions', icon: '🛡️', category: 'expertise', earnedAt: new Date() },
  { id: 'market_guru', name: 'Market Guru', description: 'Shared valuable market insights', icon: '📊', category: 'expertise', earnedAt: new Date() },
];

// Learning paths
const LEARNING_PATHS: LearningPath[] = [
  {
    id: 'LP001',
    title: 'Introduction to Modern Farming',
    description: 'Learn the basics of modern farming techniques and best practices',
    category: 'General',
    difficulty: 'beginner',
    estimatedHours: 5,
    modules: [
      { id: 'M001', title: 'Understanding Your Soil', description: 'Learn about soil types and testing', type: 'video', duration: 30, content: '', resources: [], order: 1 },
      { id: 'M002', title: 'Crop Selection', description: 'Choosing the right crops for your land', type: 'article', duration: 20, content: '', resources: [], order: 2 },
      { id: 'M003', title: 'Basic Farm Planning', description: 'Creating a farm plan', type: 'video', duration: 45, content: '', resources: [], order: 3 },
      { id: 'M004', title: 'Knowledge Check', description: 'Test your understanding', type: 'quiz', duration: 15, content: '', resources: [], order: 4 },
    ],
    enrolledCount: 1250,
    completionRate: 72,
    rating: 4.5,
  },
  {
    id: 'LP002',
    title: 'Integrated Pest Management',
    description: 'Master sustainable pest control methods',
    category: 'Pest Management',
    difficulty: 'intermediate',
    estimatedHours: 8,
    modules: [
      { id: 'M005', title: 'Understanding Pests', description: 'Common pests and their life cycles', type: 'video', duration: 40, content: '', resources: [], order: 1 },
      { id: 'M006', title: 'Biological Control', description: 'Using natural predators', type: 'video', duration: 35, content: '', resources: [], order: 2 },
      { id: 'M007', title: 'Cultural Practices', description: 'Prevention through farming practices', type: 'article', duration: 25, content: '', resources: [], order: 3 },
      { id: 'M008', title: 'Safe Pesticide Use', description: 'When and how to use pesticides safely', type: 'video', duration: 45, content: '', resources: [], order: 4 },
      { id: 'M009', title: 'Field Practice', description: 'Apply what you learned', type: 'practical', duration: 60, content: '', resources: [], order: 5 },
    ],
    enrolledCount: 890,
    completionRate: 65,
    rating: 4.7,
  },
  {
    id: 'LP003',
    title: 'Climate-Smart Agriculture',
    description: 'Adapt your farming to climate change',
    category: 'Sustainability',
    difficulty: 'advanced',
    estimatedHours: 12,
    modules: [
      { id: 'M010', title: 'Climate Change Basics', description: 'Understanding climate impacts on farming', type: 'video', duration: 50, content: '', resources: [], order: 1 },
      { id: 'M011', title: 'Water Conservation', description: 'Efficient water use techniques', type: 'video', duration: 45, content: '', resources: [], order: 2 },
      { id: 'M012', title: 'Carbon Farming', description: 'Sequestering carbon in your farm', type: 'article', duration: 40, content: '', resources: [], order: 3 },
      { id: 'M013', title: 'Drought-Resistant Varieties', description: 'Choosing climate-resilient crops', type: 'video', duration: 35, content: '', resources: [], order: 4 },
      { id: 'M014', title: 'Agroforestry', description: 'Integrating trees into farming', type: 'video', duration: 50, content: '', resources: [], order: 5 },
      { id: 'M015', title: 'Final Assessment', description: 'Comprehensive knowledge check', type: 'quiz', duration: 30, content: '', resources: [], order: 6 },
    ],
    enrolledCount: 450,
    completionRate: 58,
    rating: 4.8,
  },
];

class KnowledgeSharingService {
  private posts: BoundedMap<string, ForumPost> = new BoundedMap(5000, 86400_000);
  private comments: BoundedMap<string, Comment> = new BoundedMap(10000, 86400_000);
  private successStories: BoundedMap<string, SuccessStory> = new BoundedMap(2000, 86400_000);
  private experts: BoundedMap<string, Expert> = new BoundedMap(500, 86400_000);
  private expertSessions: BoundedMap<string, ExpertSession> = new BoundedMap(1000, 43200_000);
  private farmerProfiles: BoundedMap<number, FarmerProfile> = new BoundedMap(5000, 86400_000);
  private farmerProgress: BoundedMap<string, FarmerProgress> = new BoundedMap(5000, 86400_000);

  /**
   * Create a forum post
   */
  async createPost(params: {
    authorId: number;
    authorName: string;
    type: ContentType;
    title: string;
    content: string;
    category: ForumCategory;
    tags: string[];
    images?: string[];
    videos?: string[];
    location?: { state: string; lga: string };
    crops?: string[];
  }): Promise<ForumPost> {
    const postId = `POST-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    // Get author badges
    const profile = this.farmerProfiles.get(params.authorId);
    const authorBadges = profile?.badges.map(b => b.name) || [];

    const post: ForumPost = {
      id: postId,
      authorId: params.authorId,
      authorName: params.authorName,
      authorBadges,
      type: params.type,
      title: params.title,
      content: params.content,
      category: params.category,
      tags: params.tags,
      images: params.images,
      videos: params.videos,
      location: params.location,
      crops: params.crops,
      upvotes: 0,
      downvotes: 0,
      viewCount: 0,
      commentCount: 0,
      isPinned: false,
      isFeatured: false,
      status: 'approved', // Auto-approve for now
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.posts.set(postId, post);

    // Update author profile
    if (profile) {
      profile.postsCount++;
      profile.points += 10;
      profile.lastActiveAt = new Date();

      // Award first post badge
      if (profile.postsCount === 1) {
        this.awardBadge(params.authorId, 'first_post');
      }
    }

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'knowledge-sharing-events',
        messages: [{
          key: postId,
          value: JSON.stringify({
            event: 'post_created',
            post,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[KnowledgeSharing] Could not emit Kafka event:', error);
    }

    return post;
  }

  /**
   * Get forum posts with filters
   */
  async getPosts(params: {
    category?: ForumCategory;
    type?: ContentType;
    tags?: string[];
    crops?: string[];
    state?: string;
    sortBy?: 'recent' | 'popular' | 'unanswered';
    page?: number;
    limit?: number;
  }): Promise<{ posts: ForumPost[]; total: number; hasMore: boolean }> {
    const { category, type, tags, crops, state, sortBy = 'recent', page = 1, limit = 20 } = params;

    let posts = Array.from(this.posts.values()).filter(p => p.status === 'approved');

    // Apply filters
    if (category) {
      posts = posts.filter(p => p.category === category);
    }
    if (type) {
      posts = posts.filter(p => p.type === type);
    }
    if (tags && tags.length > 0) {
      posts = posts.filter(p => tags.some(t => p.tags.includes(t)));
    }
    if (crops && crops.length > 0) {
      posts = posts.filter(p => p.crops?.some(c => crops.includes(c)));
    }
    if (state) {
      posts = posts.filter(p => p.location?.state === state);
    }

    // Sort
    switch (sortBy) {
      case 'popular':
        posts.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
        break;
      case 'unanswered':
        posts = posts.filter(p => p.type === 'question' && !p.isAnswered);
        posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      default:
        posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    // Paginate
    const total = posts.length;
    const start = (page - 1) * limit;
    const paginatedPosts = posts.slice(start, start + limit);

    return {
      posts: paginatedPosts,
      total,
      hasMore: start + limit < total,
    };
  }

  /**
   * Add a comment to a post
   */
  async addComment(params: {
    postId: string;
    parentId?: string;
    authorId: number;
    authorName: string;
    content: string;
    images?: string[];
  }): Promise<Comment> {
    const { postId, parentId, authorId, authorName, content, images } = params;

    const post = this.posts.get(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    const profile = this.farmerProfiles.get(authorId);
    const authorBadges = profile?.badges.map(b => b.name) || [];

    const commentId = `CMT-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const comment: Comment = {
      id: commentId,
      postId,
      parentId,
      authorId,
      authorName,
      authorBadges,
      content,
      images,
      upvotes: 0,
      downvotes: 0,
      isAcceptedAnswer: false,
      isExpertAnswer: this.isExpert(authorId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.comments.set(commentId, comment);

    // Update post comment count
    post.commentCount++;
    post.updatedAt = new Date();

    // Update author profile
    if (profile) {
      profile.answersCount++;
      profile.points += 5;
      profile.lastActiveAt = new Date();
    }

    return comment;
  }

  /**
   * Vote on a post or comment
   */
  async vote(params: {
    targetId: string;
    targetType: 'post' | 'comment';
    voterId: number;
    voteType: 'up' | 'down';
  }): Promise<void> {
    const { targetId, targetType, voteType } = params;

    if (targetType === 'post') {
      const post = this.posts.get(targetId);
      if (post) {
        if (voteType === 'up') {
          post.upvotes++;
        } else {
          post.downvotes++;
        }

        // Update author's helpful votes
        const profile = this.farmerProfiles.get(post.authorId);
        if (profile && voteType === 'up') {
          profile.helpfulVotesReceived++;
          profile.points += 2;

          // Check for badges
          if (profile.helpfulVotesReceived === 10) {
            this.awardBadge(post.authorId, 'helpful_10');
          } else if (profile.helpfulVotesReceived === 50) {
            this.awardBadge(post.authorId, 'helpful_50');
          } else if (profile.helpfulVotesReceived === 100) {
            this.awardBadge(post.authorId, 'helpful_100');
          }
        }
      }
    } else {
      const comment = this.comments.get(targetId);
      if (comment) {
        if (voteType === 'up') {
          comment.upvotes++;
        } else {
          comment.downvotes++;
        }

        // Update author's helpful votes
        const profile = this.farmerProfiles.get(comment.authorId);
        if (profile && voteType === 'up') {
          profile.helpfulVotesReceived++;
          profile.points += 2;
        }
      }
    }
  }

  /**
   * Accept an answer
   */
  async acceptAnswer(postId: string, commentId: string, acceptorId: number): Promise<void> {
    const post = this.posts.get(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    if (post.authorId !== acceptorId) {
      throw new Error('Only the post author can accept an answer');
    }

    const comment = this.comments.get(commentId);
    if (!comment || comment.postId !== postId) {
      throw new Error('Comment not found');
    }

    // Mark as accepted
    comment.isAcceptedAnswer = true;
    post.isAnswered = true;
    post.acceptedAnswerId = commentId;

    // Award points to answerer
    const profile = this.farmerProfiles.get(comment.authorId);
    if (profile) {
      profile.acceptedAnswersCount++;
      profile.points += 15;
    }
  }

  /**
   * Create a success story
   */
  async createSuccessStory(params: {
    farmerId: number;
    farmerName: string;
    farmerPhoto?: string;
    title: string;
    summary: string;
    fullStory: string;
    challenge: string;
    solution: string;
    results: StoryResult[];
    crops: string[];
    location: { state: string; lga: string };
    farmSize: number;
    images: string[];
    videoUrl?: string;
    practicesUsed: string[];
    lessonsLearned: string[];
  }): Promise<SuccessStory> {
    const storyId = `STORY-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    const story: SuccessStory = {
      id: storyId,
      farmerId: params.farmerId,
      farmerName: params.farmerName,
      farmerPhoto: params.farmerPhoto,
      title: params.title,
      summary: params.summary,
      fullStory: params.fullStory,
      challenge: params.challenge,
      solution: params.solution,
      results: params.results,
      crops: params.crops,
      location: params.location,
      farmSize: params.farmSize,
      images: params.images,
      videoUrl: params.videoUrl,
      practicesUsed: params.practicesUsed,
      lessonsLearned: params.lessonsLearned,
      viewCount: 0,
      likeCount: 0,
      shareCount: 0,
      isFeatured: false,
      isVerified: false,
      createdAt: new Date(),
    };

    this.successStories.set(storyId, story);

    // Award badge
    this.awardBadge(params.farmerId, 'success_story');

    return story;
  }

  /**
   * Get success stories
   */
  async getSuccessStories(params?: {
    crops?: string[];
    state?: string;
    featured?: boolean;
    limit?: number;
  }): Promise<SuccessStory[]> {
    let stories = Array.from(this.successStories.values());

    if (params?.crops && params.crops.length > 0) {
      stories = stories.filter(s => s.crops.some(c => params.crops!.includes(c)));
    }
    if (params?.state) {
      stories = stories.filter(s => s.location.state === params.state);
    }
    if (params?.featured) {
      stories = stories.filter(s => s.isFeatured);
    }

    stories.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (params?.limit) {
      stories = stories.slice(0, params.limit);
    }

    return stories;
  }

  /**
   * Register an expert
   */
  async registerExpert(params: {
    userId: number;
    name: string;
    photo?: string;
    title: string;
    organization: string;
    specializations: string[];
    bio: string;
    qualifications: string[];
    yearsExperience: number;
    languages: string[];
    contactPreference: Expert['contactPreference'];
  }): Promise<Expert> {
    const expertId = `EXP-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    const expert: Expert = {
      id: expertId,
      userId: params.userId,
      name: params.name,
      photo: params.photo,
      title: params.title,
      organization: params.organization,
      specializations: params.specializations,
      bio: params.bio,
      qualifications: params.qualifications,
      yearsExperience: params.yearsExperience,
      rating: 0,
      totalAnswers: 0,
      acceptedAnswers: 0,
      isAvailable: true,
      responseTime: '< 24 hours',
      languages: params.languages,
      contactPreference: params.contactPreference,
    };

    this.experts.set(expertId, expert);

    return expert;
  }

  /**
   * Get experts
   */
  async getExperts(params?: {
    specialization?: string;
    language?: string;
    available?: boolean;
  }): Promise<Expert[]> {
    let experts = Array.from(this.experts.values());

    if (params?.specialization) {
      experts = experts.filter(e => e.specializations.includes(params.specialization!));
    }
    if (params?.language) {
      experts = experts.filter(e => e.languages.includes(params.language!));
    }
    if (params?.available !== undefined) {
      experts = experts.filter(e => e.isAvailable === params.available);
    }

    return experts.sort((a, b) => b.rating - a.rating);
  }

  /**
   * Book an expert session
   */
  async bookExpertSession(params: {
    expertId: string;
    farmerId: number;
    topic: string;
    description: string;
    sessionType: ExpertSession['sessionType'];
    scheduledAt: Date;
    duration: number;
  }): Promise<ExpertSession> {
    const expert = this.experts.get(params.expertId);
    if (!expert) {
      throw new Error('Expert not found');
    }

    if (!expert.isAvailable) {
      throw new Error('Expert is not available');
    }

    const sessionId = `SES-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const session: ExpertSession = {
      id: sessionId,
      expertId: params.expertId,
      farmerId: params.farmerId,
      topic: params.topic,
      description: params.description,
      sessionType: params.sessionType,
      scheduledAt: params.scheduledAt,
      duration: params.duration,
      status: 'scheduled',
    };

    this.expertSessions.set(sessionId, session);

    return session;
  }

  /**
   * Create or update farmer profile
   */
  async upsertFarmerProfile(params: {
    farmerId: number;
    displayName: string;
    avatar?: string;
    bio?: string;
    location: { state: string; lga: string };
    farmSize: number;
    crops: string[];
    yearsExperience: number;
  }): Promise<FarmerProfile> {
    const existing = this.farmerProfiles.get(params.farmerId);

    const profile: FarmerProfile = {
      farmerId: params.farmerId,
      displayName: params.displayName,
      avatar: params.avatar,
      bio: params.bio,
      location: params.location,
      farmSize: params.farmSize,
      crops: params.crops,
      yearsExperience: params.yearsExperience,
      badges: existing?.badges || [],
      points: existing?.points || 0,
      level: existing?.level || 1,
      postsCount: existing?.postsCount || 0,
      answersCount: existing?.answersCount || 0,
      acceptedAnswersCount: existing?.acceptedAnswersCount || 0,
      helpfulVotesReceived: existing?.helpfulVotesReceived || 0,
      followersCount: existing?.followersCount || 0,
      followingCount: existing?.followingCount || 0,
      joinedAt: existing?.joinedAt || new Date(),
      lastActiveAt: new Date(),
    };

    // Calculate level based on points
    profile.level = Math.floor(profile.points / 100) + 1;

    this.farmerProfiles.set(params.farmerId, profile);

    return profile;
  }

  /**
   * Get farmer profile
   */
  getFarmerProfile(farmerId: number): FarmerProfile | null {
    return this.farmerProfiles.get(farmerId) || null;
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(params?: {
    period?: 'week' | 'month' | 'all';
    category?: 'points' | 'answers' | 'helpful';
    limit?: number;
  }): FarmerProfile[] {
    const { category = 'points', limit = 10 } = params || {};

    let profiles = Array.from(this.farmerProfiles.values());

    switch (category) {
      case 'answers':
        profiles.sort((a, b) => b.acceptedAnswersCount - a.acceptedAnswersCount);
        break;
      case 'helpful':
        profiles.sort((a, b) => b.helpfulVotesReceived - a.helpfulVotesReceived);
        break;
      default:
        profiles.sort((a, b) => b.points - a.points);
    }

    return profiles.slice(0, limit);
  }

  /**
   * Get learning paths
   */
  getLearningPaths(params?: {
    category?: string;
    difficulty?: LearningPath['difficulty'];
  }): LearningPath[] {
    let paths = [...LEARNING_PATHS];

    if (params?.category) {
      paths = paths.filter(p => p.category === params.category);
    }
    if (params?.difficulty) {
      paths = paths.filter(p => p.difficulty === params.difficulty);
    }

    return paths;
  }

  /**
   * Enroll in a learning path
   */
  async enrollInPath(farmerId: number, pathId: string): Promise<FarmerProgress> {
    const path = LEARNING_PATHS.find(p => p.id === pathId);
    if (!path) {
      throw new Error('Learning path not found');
    }

    const progressKey = `${farmerId}-${pathId}`;
    const progress: FarmerProgress = {
      farmerId,
      pathId,
      completedModules: [],
      currentModule: path.modules[0].id,
      progress: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.farmerProgress.set(progressKey, progress);

    // Update path enrollment count
    path.enrolledCount++;

    return progress;
  }

  /**
   * Complete a learning module
   */
  async completeModule(farmerId: number, pathId: string, moduleId: string): Promise<FarmerProgress> {
    const progressKey = `${farmerId}-${pathId}`;
    const progress = this.farmerProgress.get(progressKey);
    if (!progress) {
      throw new Error('Not enrolled in this path');
    }

    const path = LEARNING_PATHS.find(p => p.id === pathId);
    if (!path) {
      throw new Error('Learning path not found');
    }

    if (!progress.completedModules.includes(moduleId)) {
      progress.completedModules.push(moduleId);
    }

    progress.progress = Math.round((progress.completedModules.length / path.modules.length) * 100);
    progress.lastActivityAt = new Date();

    // Find next module
    const currentIndex = path.modules.findIndex(m => m.id === moduleId);
    if (currentIndex < path.modules.length - 1) {
      progress.currentModule = path.modules[currentIndex + 1].id;
    }

    // Award points
    const profile = this.farmerProfiles.get(farmerId);
    if (profile) {
      profile.points += 20;
    }

    // Generate certificate if completed
    if (progress.progress === 100) {
      progress.certificateUrl = `/certificates/learning/${farmerId}-${pathId}.pdf`;
      if (profile) {
        profile.points += 100;
      }
    }

    return progress;
  }

  /**
   * Get farmer's learning progress
   */
  getFarmerProgress(farmerId: number): FarmerProgress[] {
    return Array.from(this.farmerProgress.values()).filter(p => p.farmerId === farmerId);
  }

  /**
   * Search posts
   */
  async searchPosts(query: string): Promise<ForumPost[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.posts.values()).filter(p =>
      p.status === 'approved' &&
      (p.title.toLowerCase().includes(lowerQuery) ||
       p.content.toLowerCase().includes(lowerQuery) ||
       p.tags.some(t => t.toLowerCase().includes(lowerQuery)))
    );
  }

  /**
   * Get trending topics
   */
  getTrendingTopics(limit: number = 10): Array<{ tag: string; count: number }> {
    const tagCounts: Record<string, number> = {};

    // Count tags from recent posts (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const post of this.posts.values()) {
      if (post.createdAt >= weekAgo) {
        for (const tag of post.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get forum categories
   */
  getCategories(): Array<{ id: ForumCategory; name: string; description: string; postCount: number }> {
    const categories: Array<{ id: ForumCategory; name: string; description: string }> = [
      { id: 'crop_farming', name: 'Crop Farming', description: 'Discussions about growing crops' },
      { id: 'livestock', name: 'Livestock', description: 'Animal husbandry and care' },
      { id: 'pest_disease', name: 'Pest & Disease', description: 'Pest control and disease management' },
      { id: 'market_prices', name: 'Market & Prices', description: 'Market information and pricing' },
      { id: 'equipment', name: 'Equipment', description: 'Farm tools and machinery' },
      { id: 'finance', name: 'Finance', description: 'Loans, insurance, and financial advice' },
      { id: 'weather', name: 'Weather', description: 'Weather patterns and forecasts' },
      { id: 'storage', name: 'Storage', description: 'Post-harvest storage solutions' },
      { id: 'organic_farming', name: 'Organic Farming', description: 'Organic and sustainable practices' },
      { id: 'irrigation', name: 'Irrigation', description: 'Water management and irrigation' },
      { id: 'general', name: 'General', description: 'General farming discussions' },
    ];

    return categories.map(c => ({
      ...c,
      postCount: Array.from(this.posts.values()).filter(p => p.category === c.id).length,
    }));
  }

  /**
   * Get available badges
   */
  getAvailableBadges(): Badge[] {
    return BADGES;
  }

  // Private helper methods

  private awardBadge(farmerId: number, badgeId: string): void {
    const profile = this.farmerProfiles.get(farmerId);
    if (!profile) return;

    const badge = BADGES.find(b => b.id === badgeId);
    if (!badge) return;

    if (!profile.badges.some(b => b.id === badgeId)) {
      profile.badges.push({ ...badge, earnedAt: new Date() });
      profile.points += 50;
    }
  }

  private isExpert(userId: number): boolean {
    return Array.from(this.experts.values()).some(e => e.userId === userId);
  }
}

export const knowledgeSharingService = new KnowledgeSharingService();
