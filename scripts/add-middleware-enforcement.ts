/**
 * Script to add middleware enforcement (rate limiting + WAF scanning) to all
 * router mutation handlers that lack it.
 * 
 * Run with: npx tsx scripts/add-middleware-enforcement.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROUTERS_DIR = join(import.meta.dirname || __dirname, '..', 'server', 'routers');

// Routers that already have enforcement (skip them)
const ALREADY_FIXED = new Set([
  'exchange-router.ts',
  'escrow-router.ts',
  'loan-application-router.ts',
  'kyc-router.ts',
  'credit-scoring-router.ts',
  'chama-savings-router.ts',
  'marketplace-enhancements-router.ts',
  'messaging-router.ts', // already has enforcement
]);

// Financial routers that need permission checks too (not just rate limit + WAF)
const FINANCIAL_ROUTERS = new Set([
  'microfinance-router.ts',
  'mobile-money-router.ts',
  'financial-enhancements-router.ts',
  'disbursement-router.ts',
  'payment-orchestrator-router.ts',
  'p2p-lending-router.ts',
  'loan-decisioning-router.ts',
  'input-financing-router.ts',
  'collections-workflow-router.ts',
  'tokenized-assets-router.ts',
  'subscription-router.ts',
]);

// Route category for rate limit naming
function getRouteCategory(filename: string): string {
  return filename.replace('-router.ts', '').replace(/-/g, '_');
}

function addEnforcement(filePath: string, filename: string): { modified: boolean; mutationsFixed: number } {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const category = getRouteCategory(filename);
  const isFinancial = FINANCIAL_ROUTERS.has(filename);

  // Step 1: Ensure TRPCError import exists
  if (!content.includes('TRPCError')) {
    // Add after the first import line
    if (content.includes('import { z }')) {
      content = content.replace(
        'import { z }',
        'import { TRPCError } from "@trpc/server";\nimport { z }'
      );
    } else if (content.includes('from "zod"')) {
      content = content.replace(
        /import \{ z \} from ["']zod["'];?/,
        'import { TRPCError } from "@trpc/server";\nimport { z } from "zod";'
      );
    } else {
      // Add at top after first import
      content = 'import { TRPCError } from "@trpc/server";\n' + content;
    }
  }

  // Step 2: Ensure checkRateLimit and scanForThreats are imported
  if (!content.includes('checkRateLimit') || !content.includes('scanForThreats')) {
    if (content.includes('from "../integrations/middleware-router-hooks.js"')) {
      // Already has an import from middleware-router-hooks — add missing ones
      const importMatch = content.match(/import \{([^}]+)\} from ["']\.\.\/integrations\/middleware-router-hooks\.js["'];?/);
      if (importMatch) {
        let imports = importMatch[1].split(',').map(s => s.trim());
        if (!imports.includes('checkRateLimit')) imports.push('checkRateLimit');
        if (!imports.includes('scanForThreats')) imports.push('scanForThreats');
        content = content.replace(importMatch[0], `import { ${imports.join(', ')} } from "../integrations/middleware-router-hooks.js";`);
      }
    } else {
      // No middleware-router-hooks import — add one
      const hookImports = isFinancial
        ? 'checkRateLimit, scanForThreats, checkPermission'
        : 'checkRateLimit, scanForThreats';
      
      // Find the end of the last import statement (handling multi-line imports)
      // Strategy: find the last "from" in an import context followed by a semicolon or end of line
      const importEndPattern = /from\s+["'][^"']+["'];?\s*\n/g;
      let lastImportEnd = 0;
      let m;
      while ((m = importEndPattern.exec(content)) !== null) {
        lastImportEnd = m.index + m[0].length;
      }
      if (lastImportEnd === 0) {
        // Fallback: find end of first line
        lastImportEnd = content.indexOf('\n') + 1;
      }
      content = content.slice(0, lastImportEnd) + 
        `import { ${hookImports} } from "../integrations/middleware-router-hooks.js";\n` +
        content.slice(lastImportEnd);
    }
  } else if (isFinancial && !content.includes('checkPermission')) {
    // Add checkPermission to existing import
    const importMatch = content.match(/import \{([^}]+)\} from ["']\.\.\/integrations\/middleware-router-hooks\.js["'];?/);
    if (importMatch) {
      let imports = importMatch[1].split(',').map(s => s.trim());
      if (!imports.includes('checkPermission')) imports.push('checkPermission');
      content = content.replace(importMatch[0], `import { ${imports.join(', ')} } from "../integrations/middleware-router-hooks.js";`);
    }
  }

  // Step 3: Add enforcement to each mutation handler
  // Pattern: .mutation(async ({ ctx, input }) => {
  // or: .mutation(async ({ input }) => {
  // or: .mutation(async ({ ctx }) => {
  let mutationsFixed = 0;
  
  // Find all mutation handlers and add enforcement after the opening
  const mutationPattern = /\.mutation\(async \(\{([^}]*)\}\) => \{/g;
  let match;
  const insertions: Array<{ index: number; code: string }> = [];
  
  while ((match = mutationPattern.exec(content)) !== null) {
    const params = match[1];
    const insertAt = match.index + match[0].length;
    
    // Check if enforcement already exists nearby (within next 200 chars)
    const nextChunk = content.slice(insertAt, insertAt + 200);
    if (nextChunk.includes('checkRateLimit') || nextChunk.includes('scanForThreats')) {
      continue; // Already has enforcement
    }
    
    const hasCtx = params.includes('ctx');
    const hasInput = params.includes('input');
    const userId = hasCtx ? 'String(ctx.user?.id ?? "anon")' : '"anon"';
    const inputArg = hasInput ? 'input' : 'undefined';
    
    let enforcementCode = `\n      const rateCheck = await checkRateLimit("${category}", ${userId}, 20, 60);\n      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });\n      const wafScan = await scanForThreats("${category}", ${inputArg});\n      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: \`Request blocked: \${wafScan.threats.join(", ")}\` });`;
    
    if (isFinancial) {
      enforcementCode += `\n      const permCheck = await checkPermission(${userId}, "${category}", "write");\n      if (!permCheck) throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });`;
    }
    enforcementCode += '\n';
    
    insertions.push({ index: insertAt, code: enforcementCode });
    mutationsFixed++;
  }
  
  // Apply insertions in reverse order so indices don't shift
  for (let i = insertions.length - 1; i >= 0; i--) {
    const { index, code } = insertions[i];
    content = content.slice(0, index) + code + content.slice(index);
  }
  
  if (content !== originalContent) {
    writeFileSync(filePath, content);
    return { modified: true, mutationsFixed };
  }
  return { modified: false, mutationsFixed: 0 };
}

// Main
const files = readdirSync(ROUTERS_DIR).filter(f => f.endsWith('-router.ts'));
let totalModified = 0;
let totalMutations = 0;

for (const file of files) {
  if (ALREADY_FIXED.has(file)) continue;
  
  const filePath = join(ROUTERS_DIR, file);
  const content = readFileSync(filePath, 'utf-8');
  
  // Skip if no mutations
  if (!content.includes('.mutation(')) continue;
  
  const { modified, mutationsFixed } = addEnforcement(filePath, file);
  if (modified) {
    totalModified++;
    totalMutations += mutationsFixed;
    console.log(`✓ ${file}: ${mutationsFixed} mutations enforced`);
  }
}

console.log(`\nDone: ${totalModified} files modified, ${totalMutations} mutations enforced`);
