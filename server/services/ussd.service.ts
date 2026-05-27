import { getDb } from "../db.js";
import { ussdSessions, farmers, users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { USSDRequest, USSDResponse, USSDMenuStep } from "../../shared/ussd-types.js";
import bcrypt from "bcryptjs";
import { getUSSDSessionManager, USSDSession } from "./ussd-session-manager.js";
import {
  recordUssdSessionCreated,
  recordUssdSessionCompleted,
  recordUssdStepCompletion,
  recordUssdIdempotencyHit,
  recordUssdError,
} from "./messaging-metrics.js";

// Configuration
const USSD_CONFIG = {
  useRedisSession: process.env.USSD_USE_REDIS === "true",
  enableIdempotency: true,
  enableMetrics: true,
};

export class USSDService {
  private sessionManager = getUSSDSessionManager();
  private fallbackSessions = new Map<string, {
    sessionId: string;
    phoneNumber: string;
    step: USSDMenuStep;
    data: Record<string, any>;
    createdAt: number;
    updatedAt: number;
  }>();
  private fallbackProfiles = new Map<string, {
    farmerId: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    location: string;
    farmSize?: number;
    crops?: string;
    verificationStatus: string;
  }>();

  /**
   * Main USSD request handler with robustness improvements
   */
  async handleUSSDRequest(request: USSDRequest): Promise<USSDResponse> {
    const startTime = Date.now();
    const db = await getDb();
    const { sessionId, phoneNumber, text } = request;

    if (!db) {
      if (USSD_CONFIG.enableMetrics) {
        recordUssdError("database_unavailable");
      }
      return this.handleInMemoryFallback(sessionId, phoneNumber, text);
    }

    try {
      // Use Redis session manager if enabled, otherwise fall back to DB
      if (USSD_CONFIG.useRedisSession) {
        return await this.handleWithRedisSession(sessionId, phoneNumber, text, db, startTime);
      }

      // Legacy DB-based session handling
      return await this.handleWithDbSession(sessionId, phoneNumber, text, db, startTime);
    } catch (error: any) {
      console.error("[USSD] Request error:", error);
      if (USSD_CONFIG.enableMetrics) {
        recordUssdError(error.code || "unknown_error");
      }

      const recoverableInfrastructureError =
        error?.code === "ECONNREFUSED" ||
        error?.code === "57P01" ||
        error?.name === "DrizzleQueryError" ||
        String(error?.message || "").includes("ECONNREFUSED") ||
        String(error?.message || "").includes("connect") ||
        String(error?.message || "").includes("Failed query");

      if (recoverableInfrastructureError) {
        return this.handleInMemoryFallback(sessionId, phoneNumber, text);
      }

      return {
        text: "An error occurred. Please try again.",
        continueSession: false,
      };
    }
  }

  private async handleInMemoryFallback(
    sessionId: string,
    phoneNumber: string,
    text: string
  ): Promise<USSDResponse> {
    let session = this.fallbackSessions.get(sessionId);

    if (!session) {
      session = {
        sessionId,
        phoneNumber,
        step: USSDMenuStep.MAIN_MENU,
        data: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.fallbackSessions.set(sessionId, session);
      return this.showMainMenu();
    }

    if (!text) {
      session.step = USSDMenuStep.MAIN_MENU;
      session.updatedAt = Date.now();
      session.data = {};
      return this.showMainMenu();
    }

    const currentInput = text.split("*").pop()?.trim() || "";

    switch (session.step) {
      case USSDMenuStep.MAIN_MENU:
        if (currentInput === "1") {
          session.step = USSDMenuStep.REGISTER_NAME;
          session.data = {};
          session.updatedAt = Date.now();
          return {
            text: "Farmer Registration\n\nEnter your full name:",
            continueSession: true,
          };
        }
        if (currentInput === "2") {
          return this.handleInMemoryProfileView(phoneNumber);
        }
        if (currentInput === "3") {
          const existingProfile = this.fallbackProfiles.get(phoneNumber);
          if (!existingProfile) {
            return {
              text: "No profile found. Please register first.",
              continueSession: false,
            };
          }
          session.step = USSDMenuStep.UPDATE_PROFILE;
          session.data = { ...existingProfile };
          session.updatedAt = Date.now();
          return {
            text: `Current location: ${existingProfile.location || "Not set"}\n\nEnter your new location:`,
            continueSession: true,
          };
        }
        if (currentInput === "4") {
          return {
            text: "For help, contact:\nPhone: +1234567890\nEmail: support@farmapp.com",
            continueSession: false,
          };
        }
        return {
          text: "Invalid option. Please try again.",
          continueSession: false,
        };

      case USSDMenuStep.REGISTER_NAME:
        if (currentInput.length < 2) {
          return {
            text: "Name too short. Please enter your full name:",
            continueSession: true,
          };
        }
        session.step = USSDMenuStep.REGISTER_LOCATION;
        session.data = { ...session.data, name: currentInput };
        session.updatedAt = Date.now();
        return {
          text: "Enter your location (Village/District):",
          continueSession: true,
        };

      case USSDMenuStep.REGISTER_LOCATION:
        if (currentInput.length < 2) {
          return {
            text: "Location too short. Please enter your village/district:",
            continueSession: true,
          };
        }
        session.step = USSDMenuStep.REGISTER_FARM_SIZE;
        session.data = { ...session.data, location: currentInput };
        session.updatedAt = Date.now();
        return {
          text: "Enter your farm size in acres:",
          continueSession: true,
        };

      case USSDMenuStep.REGISTER_FARM_SIZE: {
        const farmSize = Number.parseFloat(currentInput);
        if (Number.isNaN(farmSize) || farmSize <= 0) {
          return {
            text: "Invalid farm size. Please enter a number (e.g., 2.5):",
            continueSession: true,
          };
        }
        session.step = USSDMenuStep.REGISTER_CROPS;
        session.data = { ...session.data, farmSize };
        session.updatedAt = Date.now();
        return {
          text: "Enter crops you grow (comma separated):",
          continueSession: true,
        };
      }

      case USSDMenuStep.REGISTER_CROPS:
        if (currentInput.length < 2) {
          return {
            text: "Please enter at least one crop:",
            continueSession: true,
          };
        }
        session.step = USSDMenuStep.REGISTER_CONFIRM;
        session.data = { ...session.data, crops: currentInput };
        session.updatedAt = Date.now();
        return {
          text: `Confirm Registration:\n\nName: ${session.data.name}\nLocation: ${session.data.location}\nFarm Size: ${session.data.farmSize} acres\nCrops: ${currentInput}\n\n1. Confirm\n2. Cancel`,
          continueSession: true,
        };

      case USSDMenuStep.REGISTER_CONFIRM:
        if (currentInput === "2") {
          this.fallbackSessions.delete(sessionId);
          return {
            text: "Registration cancelled.",
            continueSession: false,
          };
        }
        if (currentInput !== "1") {
          return {
            text: "Invalid option. Enter 1 to confirm or 2 to cancel:",
            continueSession: true,
          };
        }
        {
          const fullName = String(session.data.name || "Farmer User").trim();
          const [firstName, ...lastNameParts] = fullName.split(" ");
          const lastName = lastNameParts.join(" ") || firstName;
          const farmerId = `OFFLINE-${String(this.fallbackProfiles.size + 1).padStart(4, "0")}`;
          this.fallbackProfiles.set(phoneNumber, {
            farmerId,
            firstName,
            lastName,
            phoneNumber,
            location: String(session.data.location || ""),
            farmSize: session.data.farmSize,
            crops: String(session.data.crops || ""),
            verificationStatus: "pending",
          });
          this.fallbackSessions.delete(sessionId);
          return {
            text: `Registration successful!\n\nYour farmer ID: ${farmerId}\nDefault password: farmer123\n\nLogin at farmapp.com to complete your profile.\n\nThank you!`,
            continueSession: false,
          };
        }

      case USSDMenuStep.UPDATE_PROFILE: {
        if (currentInput.length < 2) {
          return {
            text: "Location too short. Please enter your village/district:",
            continueSession: true,
          };
        }
        const existingProfile = this.fallbackProfiles.get(phoneNumber);
        if (!existingProfile) {
          this.fallbackSessions.delete(sessionId);
          return {
            text: "No profile found. Please register first.",
            continueSession: false,
          };
        }
        this.fallbackProfiles.set(phoneNumber, {
          ...existingProfile,
          location: currentInput,
        });
        this.fallbackSessions.delete(sessionId);
        return {
          text: `Profile updated successfully.\n\nLocation: ${currentInput}\n\nThank you!`,
          continueSession: false,
        };
      }

      default:
        this.fallbackSessions.delete(sessionId);
        return this.showMainMenu();
    }
  }

  private handleInMemoryProfileView(phoneNumber: string): USSDResponse {
    const profile = this.fallbackProfiles.get(phoneNumber);

    if (!profile) {
      return {
        text: "No profile found. Please register first.",
        continueSession: false,
      };
    }

    return {
      text: `Your Profile:\n\nName: ${profile.firstName} ${profile.lastName}\nPhone: ${profile.phoneNumber}\nLocation: ${profile.location || "Not set"}\nStatus: ${profile.verificationStatus}\n\nThank you!`,
      continueSession: false,
    };
  }

  /**
   * Handle request with Redis session manager (robust mode)
   */
  private async handleWithRedisSession(
    sessionId: string,
    phoneNumber: string,
    text: string,
    db: any,
    startTime: number
  ): Promise<USSDResponse> {
    // Get or create session with TTL
    const session = await this.sessionManager.getOrCreateSession(
      sessionId,
      phoneNumber,
      USSDMenuStep.MAIN_MENU
    );

    // Track new session
    if (session.createdAt === session.updatedAt) {
      if (USSD_CONFIG.enableMetrics) {
        recordUssdSessionCreated();
      }
      return this.showMainMenu();
    }

    // Parse user input
    const inputs = text.split("*");
    const currentInput = inputs[inputs.length - 1];

    // Route based on current step
    const response = await this.routeRequestWithIdempotency(
      session,
      currentInput,
      phoneNumber,
      db,
      startTime
    );

    return response;
  }

  /**
   * Handle request with DB session (legacy mode)
   */
  private async handleWithDbSession(
    sessionId: string,
    phoneNumber: string,
    text: string,
    db: any,
    startTime: number
  ): Promise<USSDResponse> {
    // Get or create session
    let session = await this.getSession(sessionId, db);
    
    if (!session) {
      // New session - show main menu
      session = await this.createSession(sessionId, phoneNumber, USSDMenuStep.MAIN_MENU, {}, db);
      if (USSD_CONFIG.enableMetrics) {
        recordUssdSessionCreated();
      }
      return this.showMainMenu();
    }

    // Parse user input
    const inputs = text.split("*");
    const currentInput = inputs[inputs.length - 1];

    // Route based on current step
    return await this.routeRequest(session, currentInput, phoneNumber, db);
  }

  /**
   * Route request with idempotency protection
   */
  private async routeRequestWithIdempotency(
    session: USSDSession,
    input: string,
    phoneNumber: string,
    db: any,
    startTime: number
  ): Promise<USSDResponse> {
    const step = session.step as USSDMenuStep;

    // For confirmation step, use idempotency to prevent duplicate registrations
    if (step === USSDMenuStep.REGISTER_CONFIRM && input === "1" && USSD_CONFIG.enableIdempotency) {
      const { isDuplicate, previousResult } = await this.sessionManager.checkIdempotency(
        session.sessionId,
        "register_confirm",
        { phoneNumber, data: session.data }
      );

      if (isDuplicate) {
        if (USSD_CONFIG.enableMetrics) {
          recordUssdIdempotencyHit("register_confirm");
        }
        console.log(`[USSD] Duplicate registration prevented for session ${session.sessionId}`);
        return previousResult as USSDResponse;
      }
    }

    // Route to appropriate handler
    const response = await this.routeRequestInternal(session, input, phoneNumber, db);

    // Record step completion
    if (USSD_CONFIG.enableMetrics) {
      recordUssdStepCompletion(step, Date.now() - startTime);
    }

    // For successful registration, record idempotency
    if (
      step === USSDMenuStep.REGISTER_CONFIRM &&
      input === "1" &&
      !response.continueSession &&
      response.text.includes("successful") &&
      USSD_CONFIG.enableIdempotency
    ) {
      await this.sessionManager.recordIdempotency(
        session.sessionId,
        "register_confirm",
        { phoneNumber, data: session.data },
        response
      );

      if (USSD_CONFIG.enableMetrics) {
        recordUssdSessionCompleted("registration", Date.now() - session.createdAt);
      }
    }

    return response;
  }

  /**
   * Internal route request (shared logic)
   */
  private async routeRequestInternal(
    session: USSDSession,
    input: string,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    const step = session.step as USSDMenuStep;
    const data = session.data;

    switch (step) {
      case USSDMenuStep.MAIN_MENU:
        return await this.handleMainMenuWithRedis(session.sessionId, input, phoneNumber, db);

      case USSDMenuStep.REGISTER_NAME:
        return await this.handleRegisterNameWithRedis(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_LOCATION:
        return await this.handleRegisterLocationWithRedis(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_FARM_SIZE:
        return await this.handleRegisterFarmSizeWithRedis(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_CROPS:
        return await this.handleRegisterCropsWithRedis(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_CONFIRM:
        return await this.handleRegisterConfirmWithIdempotency(session.sessionId, input, data, phoneNumber, db);

      case USSDMenuStep.VIEW_PROFILE:
        return await this.handleViewProfile(phoneNumber, db);

      case USSDMenuStep.UPDATE_PROFILE:
        return await this.handleUpdateProfile(session.sessionId, input, phoneNumber, db);

      default:
        return this.showMainMenu();
    }
  }

  // Redis-based session handlers
  private async handleMainMenuWithRedis(
    sessionId: string,
    input: string,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    switch (input) {
      case "1":
        await this.sessionManager.updateSession(sessionId, { step: USSDMenuStep.REGISTER_NAME, data: {} });
        return {
          text: "Farmer Registration\n\nEnter your full name:",
          continueSession: true,
        };

      case "2":
        await this.sessionManager.updateSession(sessionId, { step: USSDMenuStep.VIEW_PROFILE, data: {} });
        return await this.handleViewProfile(phoneNumber, db);

      case "3": {
        const user = await db.query.users.findFirst({
          where: eq(users.phoneNumber, phoneNumber),
        });

        if (!user) {
          return {
            text: "No profile found. Please register first.",
            continueSession: false,
          };
        }

        const farmer = await db.query.farmers.findFirst({
          where: eq(farmers.userId, user.id),
        });

        if (!farmer) {
          return {
            text: "No farmer profile found. Please register first.",
            continueSession: false,
          };
        }

        await this.sessionManager.updateSession(sessionId, {
          step: USSDMenuStep.UPDATE_PROFILE,
          data: {
            currentLocation: farmer.village || farmer.address || "",
          },
        });

        return {
          text: `Current location: ${farmer.village || farmer.address || "Not set"}\n\nEnter your new location:`,
          continueSession: true,
        };
      }

      case "4":
        return {
          text: "For help, contact:\n" +
                "Phone: +1234567890\n" +
                "Email: support@farmapp.com",
          continueSession: false,
        };

      default:
        return {
          text: "Invalid option. Please try again.",
          continueSession: false,
        };
    }
  }

  private async handleRegisterNameWithRedis(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    if (!input || input.trim().length < 2) {
      return {
        text: "Name too short. Please enter your full name:",
        continueSession: true,
      };
    }

    const newData = { ...data, name: input.trim() };
    await this.sessionManager.updateSession(sessionId, { step: USSDMenuStep.REGISTER_LOCATION, data: newData });

    return {
      text: "Enter your location (Village/District):",
      continueSession: true,
    };
  }

  private async handleRegisterLocationWithRedis(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    if (!input || input.trim().length < 2) {
      return {
        text: "Location too short. Please enter your village/district:",
        continueSession: true,
      };
    }

    const newData = { ...data, location: input.trim() };
    await this.sessionManager.updateSession(sessionId, { step: USSDMenuStep.REGISTER_FARM_SIZE, data: newData });

    return {
      text: "Enter your farm size in acres:",
      continueSession: true,
    };
  }

  private async handleRegisterFarmSizeWithRedis(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    const farmSize = parseFloat(input);
    
    if (isNaN(farmSize) || farmSize <= 0) {
      return {
        text: "Invalid farm size. Please enter a number (e.g., 2.5):",
        continueSession: true,
      };
    }

    const newData = { ...data, farmSize };
    await this.sessionManager.updateSession(sessionId, { step: USSDMenuStep.REGISTER_CROPS, data: newData });

    return {
      text: "Enter crops you grow (comma separated):",
      continueSession: true,
    };
  }

  private async handleRegisterCropsWithRedis(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    if (!input || input.trim().length < 2) {
      return {
        text: "Please enter at least one crop:",
        continueSession: true,
      };
    }

    const newData = { ...data, crops: input.trim() };
    await this.sessionManager.updateSession(sessionId, { step: USSDMenuStep.REGISTER_CONFIRM, data: newData });

    return {
      text: `Confirm Registration:\n\n` +
            `Name: ${newData.name}\n` +
            `Location: ${newData.location}\n` +
            `Farm Size: ${newData.farmSize} acres\n` +
            `Crops: ${newData.crops}\n\n` +
            `1. Confirm\n` +
            `2. Cancel`,
      continueSession: true,
    };
  }

  /**
   * Handle registration confirmation with idempotency
   */
  private async handleRegisterConfirmWithIdempotency(
    sessionId: string,
    input: string,
    data: any,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    if (input === "1") {
      try {
        // Create user account with idempotent check
        const [firstName, ...lastNameParts] = data.name.split(" ");
        const lastName = lastNameParts.join(" ") || firstName;

        // Check if user already exists (idempotent)
        const existingUser = await db.query.users.findFirst({
          where: eq(users.phoneNumber, phoneNumber),
        });

        let userId: number;

        if (existingUser) {
          userId = existingUser.id;
          
          // Check if farmer profile already exists (idempotent)
          const existingFarmer = await db.query.farmers.findFirst({
            where: eq(farmers.userId, userId),
          });

          if (existingFarmer) {
            // Already registered - return success without creating duplicate
            console.log(`[USSD] User ${phoneNumber} already registered, returning existing profile`);
            return {
              text: `You are already registered!\n\n` +
                    `Your farmer ID: ${userId}\n\n` +
                    `Login at farmapp.com to view your profile.\n\n` +
                    `Thank you!`,
              continueSession: false,
            };
          }
        } else {
          // Create new user with a default password
          const defaultPassword = await bcrypt.hash("farmer123", 10);
          
          const [newUser] = await db.insert(users).values({
            email: `${phoneNumber}@ussd.farmapp.com`,
            password: defaultPassword,
            firstName,
            lastName,
            phoneNumber,
            role: "farmer",
            isActive: true,
          }).returning();

          userId = newUser.id;
        }

        // Create farmer profile (with conflict handling)
        try {
          await db.insert(farmers).values({
            userId,
            firstName,
            lastName,
            phoneNumber,
            address: data.location,
            village: data.location,
            registrationDate: new Date(),
            isActive: true,
            verificationStatus: "pending",
          });
        } catch (insertError: any) {
          // Handle duplicate key error gracefully
          if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
            console.log(`[USSD] Farmer profile already exists for user ${userId}`);
            return {
              text: `You are already registered!\n\n` +
                    `Your farmer ID: ${userId}\n\n` +
                    `Login at farmapp.com to view your profile.\n\n` +
                    `Thank you!`,
              continueSession: false,
            };
          }
          throw insertError;
        }

        // Mark session as completed
        if (USSD_CONFIG.useRedisSession) {
          await this.sessionManager.updateSession(sessionId, {
            isCompleted: true,
            completedAction: "registration",
          });
        } else {
          await this.deleteSession(sessionId, db);
        }

        return {
          text: `Registration successful!\n\n` +
                `Your farmer ID: ${userId}\n` +
                `Default password: farmer123\n\n` +
                `Login at farmapp.com to complete your profile.\n\n` +
                `Thank you!`,
          continueSession: false,
        };
      } catch (error: any) {
        console.error("[USSD] Registration error:", error);
        if (USSD_CONFIG.enableMetrics) {
          recordUssdError("registration_failed");
        }
        return {
          text: "Registration failed. Please try again later or contact support.",
          continueSession: false,
        };
      }
    } else if (input === "2") {
      if (USSD_CONFIG.useRedisSession) {
        await this.sessionManager.updateSession(sessionId, {
          isCompleted: true,
          completedAction: "cancelled",
        });
      } else {
        await this.deleteSession(sessionId, db);
      }
      return {
        text: "Registration cancelled.",
        continueSession: false,
      };
    } else {
      return {
        text: "Invalid option. Enter 1 to confirm or 2 to cancel:",
        continueSession: true,
      };
    }
  }

  /**
   * Route request based on session step
   */
  private async routeRequest(
    session: any,
    input: string,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    const step = session.step as USSDMenuStep;
    const data = JSON.parse(session.data);

    switch (step) {
      case USSDMenuStep.MAIN_MENU:
        return await this.handleMainMenu(session.sessionId, input, phoneNumber, db);

      case USSDMenuStep.REGISTER_NAME:
        return await this.handleRegisterName(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_LOCATION:
        return await this.handleRegisterLocation(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_FARM_SIZE:
        return await this.handleRegisterFarmSize(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_CROPS:
        return await this.handleRegisterCrops(session.sessionId, input, data, db);

      case USSDMenuStep.REGISTER_CONFIRM:
        return await this.handleRegisterConfirm(session.sessionId, input, data, phoneNumber, db);

      case USSDMenuStep.VIEW_PROFILE:
        return await this.handleViewProfile(phoneNumber, db);

      case USSDMenuStep.UPDATE_PROFILE:
        return await this.handleUpdateProfileLegacy(session.sessionId, input, phoneNumber, db);

      default:
        return this.showMainMenu();
    }
  }

  /**
   * Show main menu
   */
  private showMainMenu(): USSDResponse {
    return {
      text: "Welcome to Farmer Registration\n" +
            "1. Register as Farmer\n" +
            "2. View My Profile\n" +
            "3. Update Profile\n" +
            "4. Help",
      continueSession: true,
    };
  }

  /**
   * Handle main menu selection
   */
  private async handleMainMenu(
    sessionId: string,
    input: string,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    switch (input) {
      case "1":
        // Start registration
        await this.updateSession(sessionId, USSDMenuStep.REGISTER_NAME, {}, db);
        return {
          text: "Farmer Registration\n\nEnter your full name:",
          continueSession: true,
        };

      case "2":
        // View profile
        await this.updateSession(sessionId, USSDMenuStep.VIEW_PROFILE, {}, db);
        return await this.handleViewProfile(phoneNumber, db);

      case "3": {
        const user = await db.query.users.findFirst({
          where: eq(users.phoneNumber, phoneNumber),
        });

        if (!user) {
          return {
            text: "No profile found. Please register first.",
            continueSession: false,
          };
        }

        const farmer = await db.query.farmers.findFirst({
          where: eq(farmers.userId, user.id),
        });

        if (!farmer) {
          return {
            text: "No farmer profile found. Please register first.",
            continueSession: false,
          };
        }

        await this.updateSession(sessionId, USSDMenuStep.UPDATE_PROFILE, {
          currentLocation: farmer.village || farmer.address || "",
        }, db);

        return {
          text: `Current location: ${farmer.village || farmer.address || "Not set"}\n\nEnter your new location:`,
          continueSession: true,
        };
      }

      case "4":
        return {
          text: "For help, contact:\n" +
                "Phone: +1234567890\n" +
                "Email: support@farmapp.com",
          continueSession: false,
        };

      default:
        return {
          text: "Invalid option. Please try again.",
          continueSession: false,
        };
    }
  }

  /**
   * Handle name input
   */
  private async handleRegisterName(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    if (!input || input.trim().length < 2) {
      return {
        text: "Name too short. Please enter your full name:",
        continueSession: true,
      };
    }

    data.name = input.trim();
    await this.updateSession(sessionId, USSDMenuStep.REGISTER_LOCATION, data, db);

    return {
      text: "Enter your location (Village/District):",
      continueSession: true,
    };
  }

  /**
   * Handle location input
   */
  private async handleRegisterLocation(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    if (!input || input.trim().length < 2) {
      return {
        text: "Location too short. Please enter your village/district:",
        continueSession: true,
      };
    }

    data.location = input.trim();
    await this.updateSession(sessionId, USSDMenuStep.REGISTER_FARM_SIZE, data, db);

    return {
      text: "Enter your farm size in acres:",
      continueSession: true,
    };
  }

  /**
   * Handle farm size input
   */
  private async handleRegisterFarmSize(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    const farmSize = parseFloat(input);
    
    if (isNaN(farmSize) || farmSize <= 0) {
      return {
        text: "Invalid farm size. Please enter a number (e.g., 2.5):",
        continueSession: true,
      };
    }

    data.farmSize = farmSize;
    await this.updateSession(sessionId, USSDMenuStep.REGISTER_CROPS, data, db);

    return {
      text: "Enter crops you grow (comma separated):",
      continueSession: true,
    };
  }

  /**
   * Handle crops input
   */
  private async handleRegisterCrops(
    sessionId: string,
    input: string,
    data: any,
    db: any
  ): Promise<USSDResponse> {
    if (!input || input.trim().length < 2) {
      return {
        text: "Please enter at least one crop:",
        continueSession: true,
      };
    }

    data.crops = input.trim();
    await this.updateSession(sessionId, USSDMenuStep.REGISTER_CONFIRM, data, db);

    return {
      text: `Confirm Registration:\n\n` +
            `Name: ${data.name}\n` +
            `Location: ${data.location}\n` +
            `Farm Size: ${data.farmSize} acres\n` +
            `Crops: ${data.crops}\n\n` +
            `1. Confirm\n` +
            `2. Cancel`,
      continueSession: true,
    };
  }

  /**
   * Handle registration confirmation
   */
  private async handleRegisterConfirm(
    sessionId: string,
    input: string,
    data: any,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    if (input === "1") {
      try {
        // Create user account
        const [firstName, ...lastNameParts] = data.name.split(" ");
        const lastName = lastNameParts.join(" ") || firstName;

        // Check if user already exists
        const existingUser = await db.query.users.findFirst({
          where: eq(users.phoneNumber, phoneNumber),
        });

        let userId: number;

        if (existingUser) {
          userId = existingUser.id;
        } else {
          // Create new user with a default password (they can change it later via web)
          const defaultPassword = await bcrypt.hash("farmer123", 10);
          
          const [newUser] = await db.insert(users).values({
            email: `${phoneNumber}@ussd.farmapp.com`,
            password: defaultPassword,
            firstName,
            lastName,
            phoneNumber,
            role: "farmer",
            isActive: true,
          }).returning();

          userId = newUser.id;
        }

        // Create farmer profile
        await db.insert(farmers).values({
          userId,
          firstName,
          lastName,
          phoneNumber,
          address: data.location,
          village: data.location,
          registrationDate: new Date(),
          isActive: true,
          verificationStatus: "pending",
        });

        // Clean up session
        await this.deleteSession(sessionId, db);

        return {
          text: `Registration successful!\n\n` +
                `Your farmer ID: ${userId}\n` +
                `Default password: farmer123\n\n` +
                `Login at farmapp.com to complete your profile.\n\n` +
                `Thank you!`,
          continueSession: false,
        };
      } catch (error) {
        console.error("Registration error:", error);
        return {
          text: "Registration failed. Please try again later or contact support.",
          continueSession: false,
        };
      }
    } else if (input === "2") {
      await this.deleteSession(sessionId, db);
      return {
        text: "Registration cancelled.",
        continueSession: false,
      };
    } else {
      return {
        text: "Invalid option. Enter 1 to confirm or 2 to cancel:",
        continueSession: true,
      };
    }
  }

  private async handleUpdateProfile(
    sessionId: string,
    input: string,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    const nextLocation = input.trim();

    if (!nextLocation || nextLocation.length < 2) {
      return {
        text: "Location too short. Please enter your village/district:",
        continueSession: true,
      };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.phoneNumber, phoneNumber),
    });

    if (!user) {
      return {
        text: "No profile found. Please register first.",
        continueSession: false,
      };
    }

    await db
      .update(farmers)
      .set({
        village: nextLocation,
        address: nextLocation,
      })
      .where(eq(farmers.userId, user.id));

    await this.sessionManager.updateSession(sessionId, {
      step: USSDMenuStep.MAIN_MENU,
      data: {},
      isCompleted: true,
      completedAction: "update_profile",
    });

    return {
      text: `Profile updated successfully.\n\nLocation: ${nextLocation}\n\nThank you!`,
      continueSession: false,
    };
  }

  private async handleUpdateProfileLegacy(
    sessionId: string,
    input: string,
    phoneNumber: string,
    db: any
  ): Promise<USSDResponse> {
    const nextLocation = input.trim();

    if (!nextLocation || nextLocation.length < 2) {
      return {
        text: "Location too short. Please enter your village/district:",
        continueSession: true,
      };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.phoneNumber, phoneNumber),
    });

    if (!user) {
      return {
        text: "No profile found. Please register first.",
        continueSession: false,
      };
    }

    await db
      .update(farmers)
      .set({
        village: nextLocation,
        address: nextLocation,
      })
      .where(eq(farmers.userId, user.id));

    await this.deleteSession(sessionId, db);

    return {
      text: `Profile updated successfully.\n\nLocation: ${nextLocation}\n\nThank you!`,
      continueSession: false,
    };
  }

  /**
   * Handle view profile
   */
  private async handleViewProfile(phoneNumber: string, db: any): Promise<USSDResponse> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.phoneNumber, phoneNumber),
      });

      if (!user) {
        return {
          text: "No profile found. Please register first.",
          continueSession: false,
        };
      }

      const farmer = await db.query.farmers.findFirst({
        where: eq(farmers.userId, user.id),
      });

      if (!farmer) {
        return {
          text: "No farmer profile found. Please register first.",
          continueSession: false,
        };
      }

      return {
        text: `Your Profile:\n\n` +
              `Name: ${farmer.firstName} ${farmer.lastName}\n` +
              `Phone: ${farmer.phoneNumber}\n` +
              `Location: ${farmer.village || "Not set"}\n` +
              `Status: ${farmer.verificationStatus}\n\n` +
              `Thank you!`,
        continueSession: false,
      };
    } catch (error) {
      console.error("View profile error:", error);
      return {
        text: "Error retrieving profile. Please try again later.",
        continueSession: false,
      };
    }
  }

  /**
   * Session management methods
   */
  private async getSession(sessionId: string, db: any) {
    const [session] = await db
      .select()
      .from(ussdSessions)
      .where(eq(ussdSessions.sessionId, sessionId))
      .limit(1);
    return session;
  }

  private async createSession(
    sessionId: string,
    phoneNumber: string,
    step: string,
    data: any,
    db: any
  ) {
    const [session] = await db
      .insert(ussdSessions)
      .values({
        sessionId,
        phoneNumber,
        step,
        data: JSON.stringify(data),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return session;
  }

  private async updateSession(sessionId: string, step: string, data: any, db: any) {
    await db
      .update(ussdSessions)
      .set({
        step,
        data: JSON.stringify(data),
        updatedAt: new Date(),
      })
      .where(eq(ussdSessions.sessionId, sessionId));
  }

  private async deleteSession(sessionId: string, db: any) {
    await db.delete(ussdSessions).where(eq(ussdSessions.sessionId, sessionId));
  }
}

export const ussdService = new USSDService();
