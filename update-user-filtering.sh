#!/bin/bash
# This script documents the pattern for adding user filtering to all pages
# Pattern to apply:
# 1. Add imports: useAuth from @/contexts/AuthContext and eq from drizzle-orm
# 2. Add const { user } = useAuth(); after useDatabase()
# 3. Add if (!user) return; at start of fetch functions
# 4. Add .where(eq(tableName.userId, user.id)) to SELECT queries
# 5. Add userId: user.id to INSERT values
# 6. Add if (!user) check before INSERT operations

echo "User filtering pattern documented"
echo "Pages to update: Farms, Crops, Livestock, FarmInputs, Harvests, Expenses, Dashboard, Reports"
