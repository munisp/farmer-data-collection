#!/bin/bash
# Convert PostgreSQL Drizzle schema to MySQL schema

for file in drizzle/schema.ts drizzle/financial-schema.ts drizzle/schema-gps-models.ts; do
  if [ -f "$file" ]; then
    echo "Converting $file..."
    # Backup original
    cp "$file" "${file}.pg-backup"
    
    # Convert imports
    sed -i 's/from "drizzle-orm\/pg-core"/from "drizzle-orm\/mysql-core"/g' "$file"
    
    # Convert table definitions
    sed -i 's/pgTable/mysqlTable/g' "$file"
    
    # Convert column types
    sed -i 's/serial(/int(/g' "$file"
    sed -i 's/\.serial(/.int(/g' "$file"
    
    # Add auto-increment for primary keys (approximate - may need manual review)
    # This is a simple replacement, real conversion needs more careful handling
    
    # Convert jsonb to json (MySQL doesn't have jsonb)
    sed -i 's/jsonb(/json(/g' "$file"
    sed -i 's/\.jsonb(/.json(/g' "$file"
    
    echo "Converted $file (backup at ${file}.pg-backup)"
  fi
done

echo "Schema conversion complete. Please review the changes manually."
