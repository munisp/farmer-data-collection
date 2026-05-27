import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data';

describe('Authentication System', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let testUserId: number;

  beforeAll(async () => {
    client = postgres(DATABASE_URL);
    db = drizzle(client);
  });

  afterAll(async () => {
    // Clean up test user
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await client.end();
  });

  it('should hash passwords correctly', async () => {
    const password = 'TestPassword123!';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    expect(hashedPassword).not.toBe(password);
    expect(hashedPassword.length).toBeGreaterThan(50);
    
    const isValid = await bcrypt.compare(password, hashedPassword);
    expect(isValid).toBe(true);
  });

  it('should create a new user with hashed password', async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    
    const [newUser] = await db.insert(users).values({
      email: 'test.auth@example.com',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
    }).returning();

    testUserId = newUser.id;
    
    expect(newUser).toBeDefined();
    expect(newUser.email).toBe('test.auth@example.com');
    expect(newUser.firstName).toBe('Test');
    expect(newUser.role).toBe('user');
    expect(newUser.isActive).toBe(true);
  });

  it('should retrieve user by email', async () => {
    const [user] = await db.select().from(users).where(eq(users.email, 'test.auth@example.com'));
    
    expect(user).toBeDefined();
    expect(user.email).toBe('test.auth@example.com');
  });

  it('should verify password for existing user', async () => {
    const [user] = await db.select().from(users).where(eq(users.email, 'test.auth@example.com'));
    
    const isValid = await bcrypt.compare('TestPassword123!', user.password);
    expect(isValid).toBe(true);
    
    const isInvalid = await bcrypt.compare('WrongPassword', user.password);
    expect(isInvalid).toBe(false);
  });

  it('should prevent duplicate email registration', async () => {
    const hashedPassword = await bcrypt.hash('AnotherPassword123!', 10);
    
    await expect(
      db.insert(users).values({
        email: 'test.auth@example.com', // Duplicate email
        password: hashedPassword,
        firstName: 'Duplicate',
        lastName: 'User',
        role: 'user',
      })
    ).rejects.toThrow();
  });

  it('should support different user roles', async () => {
    const hashedPassword = await bcrypt.hash('AdminPassword123!', 10);
    
    const [adminUser] = await db.insert(users).values({
      email: 'admin.test@example.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'Test',
      role: 'admin',
    }).returning();

    expect(adminUser.role).toBe('admin');
    
    // Clean up
    await db.delete(users).where(eq(users.id, adminUser.id));
  });

  it('should have timestamps for created and updated', async () => {
    const [user] = await db.select().from(users).where(eq(users.email, 'test.auth@example.com'));
    
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });
});
