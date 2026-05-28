/**
 * Duplicate detection utilities for farmer data
 */

import { getDb } from "@/db";
import { farmers } from "@/db/schema";
import { eq, or, and, ne, sql } from "drizzle-orm";

export interface DuplicateMatch {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  nationalId: string | null;
  email: string | null;
  matchReason: string[];
  matchScore: number;
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, ''); // Remove all non-digits
}

/**
 * Normalize name for comparison
 */
function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().trim();
}

/**
 * Calculate similarity between two strings (Levenshtein distance)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * Check for duplicate farmers based on phone number, national ID, and name similarity
 */
export async function checkForDuplicates(
  _db: any,
  farmerData: {
    firstName: string;
    lastName: string;
    phoneNumber?: string | null;
    nationalId?: string | null;
    email?: string | null;
  },
  userId: number,
  excludeId?: number
): Promise<DuplicateMatch[]> {
  const drizzleDb = await getDb();
  const duplicates: DuplicateMatch[] = [];

  try {
    // Get all farmers for this user
    let query = drizzleDb
      .select()
      .from(farmers)
      .where(eq(farmers.userId, userId));

    const allFarmers = await query;

    // Filter out the current farmer if editing
    const farmersToCheck = excludeId
      ? allFarmers.filter((f: any) => f.id !== excludeId)
      : allFarmers;

    const normalizedPhone = normalizePhone(farmerData.phoneNumber);
    const normalizedFirstName = normalizeName(farmerData.firstName);
    const normalizedLastName = normalizeName(farmerData.lastName);

    for (const existingFarmer of farmersToCheck) {
      const matchReasons: string[] = [];
      let matchScore = 0;

      // Check phone number (exact match)
      if (normalizedPhone && normalizePhone(existingFarmer.phoneNumber) === normalizedPhone) {
        matchReasons.push('Same phone number');
        matchScore += 50;
      }

      // Check national ID (exact match)
      if (
        farmerData.nationalId &&
        existingFarmer.nationalId &&
        farmerData.nationalId.toUpperCase() === existingFarmer.nationalId.toUpperCase()
      ) {
        matchReasons.push('Same national ID');
        matchScore += 50;
      }

      // Check email (exact match)
      if (
        farmerData.email &&
        existingFarmer.email &&
        farmerData.email.toLowerCase() === existingFarmer.email.toLowerCase()
      ) {
        matchReasons.push('Same email');
        matchScore += 30;
      }

      // Check name similarity
      const firstNameSimilarity = calculateSimilarity(
        normalizedFirstName,
        normalizeName(existingFarmer.firstName)
      );
      const lastNameSimilarity = calculateSimilarity(
        normalizedLastName,
        normalizeName(existingFarmer.lastName)
      );

      const nameSimilarity = (firstNameSimilarity + lastNameSimilarity) / 2;

      if (nameSimilarity > 0.85) {
        matchReasons.push('Very similar name');
        matchScore += Math.round(nameSimilarity * 20);
      }

      // If we have any matches, add to duplicates list
      if (matchReasons.length > 0) {
        duplicates.push({
          id: existingFarmer.id,
          firstName: existingFarmer.firstName,
          lastName: existingFarmer.lastName,
          phoneNumber: existingFarmer.phoneNumber,
          nationalId: existingFarmer.nationalId,
          email: existingFarmer.email,
          matchReason: matchReasons,
          matchScore,
        });
      }
    }

    // Sort by match score (highest first)
    duplicates.sort((a, b) => b.matchScore - a.matchScore);

    return duplicates;
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    return [];
  }
}

/**
 * Get duplicate risk level based on match score
 */
export function getDuplicateRiskLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/**
 * Get duplicate risk color
 */
export function getDuplicateRiskColor(score: number): string {
  const level = getDuplicateRiskLevel(score);
  switch (level) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'secondary';
    case 'low':
      return 'default';
  }
}
