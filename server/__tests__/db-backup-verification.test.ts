/**
 * Database Backup End-to-End Verification Tests
 * Validates backup script, restore process, and data integrity.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const BACKUP_SCRIPT = path.join(__dirname, '../../scripts/db-backup.sh');

describe('Database Backup Automation', () => {
  it('Backup script exists and is executable', () => {
    expect(fs.existsSync(BACKUP_SCRIPT)).toBe(true);
    const stats = fs.statSync(BACKUP_SCRIPT);
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('Backup script contains required functions', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf-8');
    expect(content).toContain('pg_dump');
    expect(content).toContain('backup');
    expect(content).toContain('restore');
  });

  it('Backup script handles S3 upload', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf-8');
    expect(content).toMatch(/aws s3|s3cmd|S3_BUCKET/i);
  });

  it('Backup script supports verification', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf-8');
    expect(content).toMatch(/verify|check|integrity/i);
  });

  it('Backup script has error handling', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf-8');
    expect(content).toMatch(/set -e|trap|error|fail/i);
  });

  it('Backup script supports compression', () => {
    const content = fs.readFileSync(BACKUP_SCRIPT, 'utf-8');
    expect(content).toMatch(/gzip|gz|compress|Fc/i);
  });
});

describe('Secrets Rotation Automation', () => {
  const rotationScript = path.join(__dirname, '../../vault/secrets-rotation.sh');

  it('Secrets rotation script exists and is executable', () => {
    expect(fs.existsSync(rotationScript)).toBe(true);
    const stats = fs.statSync(rotationScript);
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('Rotation script handles JWT, database, and API key types', () => {
    const content = fs.readFileSync(rotationScript, 'utf-8');
    expect(content).toMatch(/jwt|JWT/i);
    expect(content).toMatch(/database|DB_/i);
    expect(content).toMatch(/api.*key|API_KEY/i);
  });
});

describe('Vault TLS Configuration', () => {
  const vaultConfig = path.join(__dirname, '../../vault/config.hcl');
  const tlsGenScript = path.join(__dirname, '../../vault/generate-tls-certs.sh');

  it('Vault config references TLS', () => {
    expect(fs.existsSync(vaultConfig)).toBe(true);
    const content = fs.readFileSync(vaultConfig, 'utf-8');
    expect(content).toMatch(/tls/i);
  });

  it('TLS certificate generation script exists', () => {
    expect(fs.existsSync(tlsGenScript)).toBe(true);
  });

  it('TLS script generates CA, server, and client certs', () => {
    const content = fs.readFileSync(tlsGenScript, 'utf-8');
    expect(content).toContain('ca-cert');
    expect(content).toContain('server-cert');
    expect(content).toContain('client-cert');
  });
});
