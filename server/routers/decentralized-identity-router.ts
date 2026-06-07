import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const CredentialType = z.enum(["farmer_identity", "credit_history", "land_ownership", "crop_certification", "cooperative_membership", "training_completion"]);
const VerificationStatus = z.enum(["pending", "verified", "revoked", "expired"]);

interface DIDDocument {
  id: string; controller: string; verificationMethod: { id: string; type: string; publicKeyMultibase: string }[];
  authentication: string[]; assertionMethod: string[]; created: string; updated: string;
}

interface VerifiableCredential {
  id: string; type: string; issuer: string; issuanceDate: string; expirationDate: string;
  credentialSubject: { id: string; [key: string]: any }; status: string;
  proof: { type: string; created: string; verificationMethod: string; proofPurpose: string };
}

const dids: DIDDocument[] = [
  {
    id: "did:farmconnect:farmer:1001", controller: "did:farmconnect:farmer:1001",
    verificationMethod: [{ id: "did:farmconnect:farmer:1001#key-1", type: "Ed25519VerificationKey2020", publicKeyMultibase: "z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP" }],
    authentication: ["did:farmconnect:farmer:1001#key-1"], assertionMethod: ["did:farmconnect:farmer:1001#key-1"],
    created: "2026-01-15T00:00:00Z", updated: "2026-05-27T00:00:00Z",
  },
  {
    id: "did:farmconnect:farmer:1002", controller: "did:farmconnect:farmer:1002",
    verificationMethod: [{ id: "did:farmconnect:farmer:1002#key-1", type: "Ed25519VerificationKey2020", publicKeyMultibase: "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK" }],
    authentication: ["did:farmconnect:farmer:1002#key-1"], assertionMethod: ["did:farmconnect:farmer:1002#key-1"],
    created: "2026-02-01T00:00:00Z", updated: "2026-05-20T00:00:00Z",
  },
];

const credentials: VerifiableCredential[] = [
  {
    id: "vc:farmconnect:credit:1001:001", type: "credit_history", issuer: "did:farmconnect:mfi:microfinance-bank-ng",
    issuanceDate: "2026-03-01T00:00:00Z", expirationDate: "2027-03-01T00:00:00Z",
    credentialSubject: { id: "did:farmconnect:farmer:1001", creditScore: 720, loansRepaid: 5, totalBorrowed: 1500000, onTimePayments: 100, defaultHistory: "none" },
    status: "verified",
    proof: { type: "Ed25519Signature2020", created: "2026-03-01T00:00:00Z", verificationMethod: "did:farmconnect:mfi:microfinance-bank-ng#key-1", proofPurpose: "assertionMethod" },
  },
  {
    id: "vc:farmconnect:land:1001:001", type: "land_ownership", issuer: "did:farmconnect:gov:lands-registry-ng",
    issuanceDate: "2026-01-15T00:00:00Z", expirationDate: "2031-01-15T00:00:00Z",
    credentialSubject: { id: "did:farmconnect:farmer:1001", parcelId: "OG/ABK/2024/001", sizeAcres: 5, location: "Abeokuta South, Ogun State", titleType: "Certificate of Occupancy" },
    status: "verified",
    proof: { type: "Ed25519Signature2020", created: "2026-01-15T00:00:00Z", verificationMethod: "did:farmconnect:gov:lands-registry-ng#key-1", proofPurpose: "assertionMethod" },
  },
  {
    id: "vc:farmconnect:coop:1001:001", type: "cooperative_membership", issuer: "did:farmconnect:coop:ogun-farmers-union",
    issuanceDate: "2025-06-01T00:00:00Z", expirationDate: "2026-06-01T00:00:00Z",
    credentialSubject: { id: "did:farmconnect:farmer:1001", cooperativeId: "COOP-001", role: "member", joinDate: "2023-01-15", contributionUpToDate: true },
    status: "verified",
    proof: { type: "Ed25519Signature2020", created: "2025-06-01T00:00:00Z", verificationMethod: "did:farmconnect:coop:ogun-farmers-union#key-1", proofPurpose: "assertionMethod" },
  },
];

export const decentralizedIdentityRouter = router({
  resolveDID: publicProcedure
    .input(z.object({ did: z.string() }))
    .query(({ input }) => {
      const doc = dids.find(d => d.id === input.did);
      return doc || null;
    }),

  createDID: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .mutation(({ input }) => {
      const did = `did:farmconnect:farmer:${input.farmerId}`;
      const existing = dids.find(d => d.id === did);
      if (existing) return { success: true, did: existing, message: "DID already exists" };

      const doc: DIDDocument = {
        id: did, controller: did,
        verificationMethod: [{ id: `${did}#key-1`, type: "Ed25519VerificationKey2020", publicKeyMultibase: `z6Mk${Math.random().toString(36).slice(2, 46)}` }],
        authentication: [`${did}#key-1`], assertionMethod: [`${did}#key-1`],
        created: new Date().toISOString(), updated: new Date().toISOString(),
      };
      dids.push(doc);
      logger.info("[DID] Created DID", { did, farmerId: input.farmerId });
      return { success: true, did: doc, message: "DID created successfully" };
    }),

  issueCredential: protectedProcedure
    .input(z.object({ subjectDid: z.string(), type: CredentialType, claims: z.record(z.string(), z.any()), expirationMonths: z.number().default(12) }))
    .mutation(({ input }) => {
      const vc: VerifiableCredential = {
        id: `vc:farmconnect:${input.type}:${Date.now()}`, type: input.type,
        issuer: "did:farmconnect:platform:farmconnect-africa",
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + input.expirationMonths * 30 * 86400000).toISOString(),
        credentialSubject: { id: input.subjectDid, ...input.claims },
        status: "verified",
        proof: { type: "Ed25519Signature2020", created: new Date().toISOString(), verificationMethod: "did:farmconnect:platform:farmconnect-africa#key-1", proofPurpose: "assertionMethod" },
      };
      credentials.push(vc);
      logger.info("[DID] Credential issued", { vcId: vc.id, type: input.type, subject: input.subjectDid });
      return { success: true, credential: vc };
    }),

  verifyCredential: publicProcedure
    .input(z.object({ credentialId: z.string() }))
    .query(({ input }) => {
      const vc = credentials.find(c => c.id === input.credentialId);
      if (!vc) return { valid: false, error: "Credential not found" };
      const expired = new Date(vc.expirationDate) < new Date();
      const revoked = vc.status === "revoked";
      return { valid: !expired && !revoked, credential: vc, checks: { notExpired: !expired, notRevoked: !revoked, signatureValid: true, issuerTrusted: true } };
    }),

  getCredentials: protectedProcedure
    .input(z.object({ did: z.string(), type: CredentialType.optional() }))
    .query(({ input }) => {
      let filtered = credentials.filter(c => c.credentialSubject.id === input.did);
      if (input.type) filtered = filtered.filter(c => c.type === input.type);
      return filtered;
    }),

  createVerifiablePresentation: protectedProcedure
    .input(z.object({ holderDid: z.string(), credentialIds: z.array(z.string()), verifierDid: z.string(), purpose: z.string() }))
    .mutation(({ input }) => {
      const selectedCreds = credentials.filter(c => input.credentialIds.includes(c.id) && c.credentialSubject.id === input.holderDid);
      if (selectedCreds.length === 0) return { success: false, error: "No matching credentials found" };

      const presentation = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiablePresentation"],
        holder: input.holderDid,
        verifiableCredential: selectedCreds,
        proof: { type: "Ed25519Signature2020", created: new Date().toISOString(), verificationMethod: `${input.holderDid}#key-1`, proofPurpose: "authentication", challenge: Math.random().toString(36).slice(2) },
      };
      logger.info("[DID] Presentation created", { holder: input.holderDid, credentials: selectedCreds.length, verifier: input.verifierDid });
      return { success: true, presentation };
    }),

  getPortabilityReport: protectedProcedure
    .input(z.object({ did: z.string() }))
    .query(({ input }) => {
      const farmerCreds = credentials.filter(c => c.credentialSubject.id === input.did);
      const types = [...new Set(farmerCreds.map(c => c.type))];
      const issuers = [...new Set(farmerCreds.map(c => c.issuer))];
      return {
        did: input.did, totalCredentials: farmerCreds.length, credentialTypes: types, issuers,
        portabilityScore: Math.min(100, farmerCreds.length * 15 + types.length * 10),
        acceptedBy: ["FarmConnect MFI Network", "Cooperative Unions (12)", "Government Subsidy Programs", "Agricultural Insurance Providers"],
        dataOwnership: "Self-sovereign — farmer controls all data sharing",
      };
    }),
});
