import { db } from './server/db/index.js';
import { users } from './server/db/schema.js';

const allUsers = await db.select().from(users);
console.log('Total users:', allUsers.length);
console.log('Users:', JSON.stringify(allUsers.map(u => ({ 
  id: u.id, 
  email: u.email, 
  name: u.name, 
  role: u.role,
  createdAt: u.createdAt 
})), null, 2));
process.exit(0);
