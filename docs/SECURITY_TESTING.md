# Security Testing Framework

## FarmConnect Platform — Penetration Testing & Security Audit

**Document Owner:** Security Engineering  
**Last Updated:** 2026-05-27  
**Classification:** Internal — Security

---

## 1. OWASP Top 10 Compliance Checklist

### A01:2021 — Broken Access Control ✅

| Check | Implementation | Status |
|-------|---------------|--------|
| Role-based access (RBAC) | Permify middleware on all protected routes | PASS |
| Vertical privilege escalation | `protectedProcedure` enforces auth on all 805 procedures | PASS |
| Horizontal access control | User isolation via `ctx.user.id` in all queries | PASS |
| CORS configuration | Origin whitelist in Express middleware | PASS |
| Directory traversal | No file system access from user input | PASS |
| JWT validation | RS256 signatures, expiry checks, audience validation | PASS |

### A02:2021 — Cryptographic Failures ✅

| Check | Implementation | Status |
|-------|---------------|--------|
| TLS 1.2+ enforcement | Vault TLS config `tls_min_version = "tls12"` | PASS |
| Password hashing | bcrypt with cost factor 12 | PASS |
| Sensitive data encryption | AES-256-GCM for PII (tokenization-service) | PASS |
| No hardcoded secrets | Vault-managed, env-var referenced | PASS |
| Secure session tokens | Cryptographically random, 256-bit | PASS |

### A03:2021 — Injection ✅

| Check | Implementation | Status |
|-------|---------------|--------|
| SQL injection | Drizzle ORM parameterized queries (zero raw SQL) | PASS |
| NoSQL injection | N/A (PostgreSQL only) | N/A |
| Command injection | No shell exec from user input | PASS |
| XSS prevention | React auto-escaping + CSP headers | PASS |
| Input validation | Zod schemas on all 805 tRPC procedures | PASS |

### A04:2021 — Insecure Design

| Check | Implementation | Status |
|-------|---------------|--------|
| Rate limiting | APISIX rate-limit plugin (100 req/min default) | PASS |
| Account lockout | 5 failed attempts → 15-min lockout | PASS |
| Business logic abuse | Transaction limits, velocity checks | PASS |
| Multi-factor auth | TOTP support for admin accounts | PASS |

### A05:2021 — Security Misconfiguration ✅

| Check | Implementation | Status |
|-------|---------------|--------|
| Security headers | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) | PASS |
| Default credentials | None in production configs | PASS |
| Error disclosure | Generic error messages in production | PASS |
| Unnecessary services | Minimal container images (distroless/alpine) | PASS |
| Stack trace exposure | Disabled in production (NODE_ENV check) | PASS |

### A06:2021 — Vulnerable Components

| Check | Implementation | Status |
|-------|---------------|--------|
| Dependency scanning | `npm audit` in CI pipeline | PASS |
| Known vulnerabilities | Snyk/Dependabot configured | PASS |
| Outdated libraries | Monthly update cadence | PASS |
| Container scanning | Trivy scan in Docker build | PASS |

### A07:2021 — Authentication Failures ✅

| Check | Implementation | Status |
|-------|---------------|--------|
| Credential stuffing protection | Rate limiting + account lockout | PASS |
| Weak password prevention | Minimum 8 chars, complexity rules | PASS |
| Session management | Secure, HttpOnly, SameSite cookies | PASS |
| Token expiry | Access: 15 min, Refresh: 7 days | PASS |
| Password reset security | Time-limited tokens, one-use | PASS |

### A08:2021 — Software & Data Integrity

| Check | Implementation | Status |
|-------|---------------|--------|
| CI/CD pipeline security | Branch protection, signed commits | PASS |
| Dependency integrity | package-lock.json integrity checks | PASS |
| Container image signing | GHCR with digest pinning | PASS |

### A09:2021 — Security Logging & Monitoring ✅

| Check | Implementation | Status |
|-------|---------------|--------|
| Authentication events logged | Audit trail router captures all auth events | PASS |
| Failed login monitoring | Prometheus alert on >10 failures/min | PASS |
| Log integrity | Loki with append-only TSDB | PASS |
| Alerting | PagerDuty integration for security events | PASS |

### A10:2021 — Server-Side Request Forgery (SSRF)

| Check | Implementation | Status |
|-------|---------------|--------|
| URL validation | Allowlist for external API calls | PASS |
| Internal network access | Blocked via network policies | PASS |
| DNS rebinding | N/A (no user-provided URLs fetched server-side) | N/A |

---

## 2. Automated Security Scanning

### 2.1 Static Analysis (SAST)

```yaml
# CI Pipeline Security Scanning
security-scan:
  runs-on: ubuntu-latest
  steps:
    - name: Semgrep SAST
      uses: returntocorp/semgrep-action@v1
      with:
        config: >-
          p/owasp-top-ten
          p/typescript
          p/jwt
          p/sql-injection
          
    - name: CodeQL Analysis
      uses: github/codeql-action/analyze@v3
      with:
        languages: typescript, javascript

    - name: npm audit
      run: npm audit --audit-level=high

    - name: Trivy Container Scan
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: fs
        severity: CRITICAL,HIGH
```

### 2.2 Dynamic Analysis (DAST)

```yaml
# OWASP ZAP Automated Scan
dast-scan:
  runs-on: ubuntu-latest
  services:
    app:
      image: ghcr.io/farmconnect/api:latest
  steps:
    - name: OWASP ZAP Full Scan
      uses: zaproxy/action-full-scan@v0.10.0
      with:
        target: http://app:3000
        rules_file_name: .zap/rules.tsv
        cmd_options: '-a -j -l WARN'
        
    - name: API Scan
      uses: zaproxy/action-api-scan@v0.7.0
      with:
        target: http://app:3000/api/openapi.json
        format: openapi
```

### 2.3 Dependency Scanning

```bash
# Run weekly via scheduled CI job
#!/bin/bash
# Check for known CVEs
npm audit --production --audit-level=moderate

# Check Rust dependencies
cd services/rust && cargo audit

# Check Go dependencies  
cd services/go && govulncheck ./...

# Check Python dependencies
cd services/python && pip-audit -r requirements.txt

# Container vulnerability scan
trivy image ghcr.io/farmconnect/api:latest --severity HIGH,CRITICAL
```

---

## 3. Penetration Test Scope

### 3.1 In-Scope

| Target | Type | Priority |
|--------|------|----------|
| tRPC API endpoints (805 procedures) | API testing | P0 |
| Authentication flows (JWT, OAuth) | AuthN/AuthZ | P0 |
| File upload (marketplace images) | Upload abuse | P1 |
| Payment endpoints (M-Pesa, MTN) | Financial | P0 |
| WebSocket connections | Real-time | P2 |
| Microservice inter-communication | Lateral movement | P1 |
| Mobile API surface | Mobile-specific | P1 |

### 3.2 Out-of-Scope

- Physical infrastructure attacks
- Social engineering of staff
- Denial-of-service (production)
- Third-party provider infrastructure

### 3.3 Test Types

1. **Black-box** — No source code access, simulate external attacker
2. **Grey-box** — Authenticated user, test privilege escalation
3. **White-box** — Full source access, code-level vulnerability review

---

## 4. Security Test Automation Script

```typescript
// tests/security/pen-test-automated.ts
import { describe, it, expect } from 'vitest';

describe('Automated Security Checks', () => {
  const API_URL = process.env.API_URL || 'http://localhost:3000';

  it('should reject unauthenticated access to protected routes', async () => {
    const response = await fetch(`${API_URL}/api/trpc/auth.getUser`);
    expect(response.status).toBe(401);
  });

  it('should enforce rate limiting', async () => {
    const requests = Array(150).fill(null).map(() => 
      fetch(`${API_URL}/api/trpc/auth.login`, { method: 'POST' })
    );
    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should set security headers', async () => {
    const response = await fetch(`${API_URL}/health`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).toBeTruthy();
  });

  it('should not expose stack traces', async () => {
    const response = await fetch(`${API_URL}/api/trpc/nonexistent.route`);
    const body = await response.text();
    expect(body).not.toContain('node_modules');
    expect(body).not.toContain('at Object');
  });

  it('should validate JWT signature', async () => {
    const fakeToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.FAKE';
    const response = await fetch(`${API_URL}/api/trpc/auth.getUser`, {
      headers: { Authorization: `Bearer ${fakeToken}` }
    });
    expect(response.status).toBe(401);
  });
});
```

---

## 5. Compliance Requirements

### Financial Regulations (CBN/CBK)

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| Data encryption at rest | PostgreSQL TDE + S3 encryption | Config files |
| Data encryption in transit | TLS 1.2+ enforced | Vault TLS config |
| Access logging | Audit trail on all financial operations | Audit router |
| Transaction monitoring | AML compliance automation router | Code review |
| Data retention | 7 years for financial records | Backup policy |
| Incident reporting | 72-hour notification process | DR runbook |

### Data Protection (NDPR / Kenya DPA)

| Requirement | Implementation |
|-------------|---------------|
| Consent management | User consent recorded at registration |
| Data minimization | Only required fields collected |
| Right to erasure | Soft-delete with 30-day purge cycle |
| Data portability | Export API (JSON/CSV) |
| Breach notification | Automated alert + 72-hour process |

---

## 6. Findings & Remediation Tracker

| ID | Severity | Finding | Status | Remediation |
|----|----------|---------|--------|-------------|
| SEC-001 | Medium | 252 `any` types reduce type safety | In Progress | Ongoing type narrowing |
| SEC-002 | Low | 1 client catch block without error param | Accepted | UI error state handles gracefully |
| SEC-003 | Info | Console.warn used for logging | Accepted | Appropriate for client-side |

---

## 7. Next Steps

- [ ] Schedule quarterly external pen test with certified provider
- [ ] Implement bug bounty program (HackerOne)
- [ ] Complete SOC 2 Type II audit preparation
- [ ] Add runtime security monitoring (Falco)
- [ ] Implement Web Application Firewall rules (OpenAppSec service deployed)
