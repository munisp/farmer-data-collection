/**
 * Deployment Configuration Generator
 * 
 * Generates platform-specific deployment configuration files
 * for various hosting providers (Vercel, Heroku, Docker, etc.)
 * 
 * Usage:
 *   npx tsx scripts/deploy-config-generator.ts [platform]
 *   
 * Platforms: vercel, heroku, docker, aws, gcp, azure, railway, render
 */

import * as fs from 'fs';
import * as path from 'path';

const platform = process.argv[2] || 'all';

const ENV_VARS = [
  'AFRICASTALKING_USERNAME',
  'AFRICASTALKING_API_KEY',
  'AFRICASTALKING_ENV',
  'AFRICASTALKING_SENDER_ID',
  'APP_URL',
];

function generateVercelConfig() {
  const config = {
    name: 'farmer-data-collection',
    version: 2,
    builds: [
      {
        src: 'package.json',
        use: '@vercel/node',
      },
    ],
    routes: [
      {
        src: '/api/(.*)',
        dest: '/server/index.ts',
      },
      {
        src: '/(.*)',
        dest: '/client/$1',
      },
    ],
    env: ENV_VARS.reduce((acc, key) => {
      acc[key] = `@${key.toLowerCase()}`;
      return acc;
    }, {} as Record<string, string>),
  };

  const instructions = `
# Vercel Deployment Configuration

## Setup Instructions

1. Install Vercel CLI:
   \`\`\`bash
   npm install -g vercel
   \`\`\`

2. Login to Vercel:
   \`\`\`bash
   vercel login
   \`\`\`

3. Set environment variables:
   \`\`\`bash
   vercel env add AFRICASTALKING_USERNAME
   vercel env add AFRICASTALKING_API_KEY
   vercel env add AFRICASTALKING_ENV
   vercel env add AFRICASTALKING_SENDER_ID
   vercel env add APP_URL
   \`\`\`

4. Deploy:
   \`\`\`bash
   vercel --prod
   \`\`\`

## Configuration File

Save this as \`vercel.json\`:

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

## Environment Variables

Set these in Vercel dashboard (Settings → Environment Variables):

${ENV_VARS.map(key => `- ${key}: [Your value]`).join('\n')}

## Webhook URLs

After deployment, configure these in Africa's Talking dashboard:

- USSD: https://your-app.vercel.app/api/trpc/messaging.ussdCallback
- SMS: https://your-app.vercel.app/api/trpc/messaging.smsCallback
- WhatsApp: https://your-app.vercel.app/api/trpc/messaging.whatsappCallback
`;

  fs.writeFileSync('vercel.json', JSON.stringify(config, null, 2));
  fs.writeFileSync('DEPLOY_VERCEL.md', instructions);
  
  console.log('✅ Generated: vercel.json, DEPLOY_VERCEL.md');
}

function generateHerokuConfig() {
  const procfile = 'web: pnpm start';
  
  const instructions = `
# Heroku Deployment Configuration

## Setup Instructions

1. Install Heroku CLI:
   \`\`\`bash
   curl https://cli-assets.heroku.com/install.sh | sh
   \`\`\`

2. Login to Heroku:
   \`\`\`bash
   heroku login
   \`\`\`

3. Create Heroku app:
   \`\`\`bash
   heroku create farmer-data-collection
   \`\`\`

4. Set environment variables:
   \`\`\`bash
   heroku config:set AFRICASTALKING_USERNAME=your_username
   heroku config:set AFRICASTALKING_API_KEY=your_api_key
   heroku config:set AFRICASTALKING_ENV=production
   heroku config:set AFRICASTALKING_SENDER_ID=your_sender_id
   heroku config:set APP_URL=https://your-app.herokuapp.com
   \`\`\`

5. Add PostgreSQL addon:
   \`\`\`bash
   heroku addons:create heroku-postgresql:mini
   \`\`\`

6. Deploy:
   \`\`\`bash
   git push heroku main
   \`\`\`

## Configuration Files

### Procfile

Save this as \`Procfile\`:

\`\`\`
${procfile}
\`\`\`

### app.json (for Heroku Button)

\`\`\`json
{
  "name": "Farmer Data Collection",
  "description": "Multi-channel farmer data collection platform",
  "repository": "https://github.com/your-repo/farmer-data-collection",
  "keywords": ["agriculture", "data-collection", "ussd", "sms", "whatsapp"],
  "addons": [
    {
      "plan": "heroku-postgresql:mini"
    }
  ],
  "env": {
${ENV_VARS.map(key => `    "${key}": {
      "description": "Africa's Talking ${key}",
      "required": true
    }`).join(',\n')}
  }
}
\`\`\`

## Webhook URLs

After deployment, configure these in Africa's Talking dashboard:

- USSD: https://your-app.herokuapp.com/api/trpc/messaging.ussdCallback
- SMS: https://your-app.herokuapp.com/api/trpc/messaging.smsCallback
- WhatsApp: https://your-app.herokuapp.com/api/trpc/messaging.whatsappCallback
`;

  fs.writeFileSync('Procfile', procfile);
  fs.writeFileSync('DEPLOY_HEROKU.md', instructions);
  
  console.log('✅ Generated: Procfile, DEPLOY_HEROKU.md');
}

function generateDockerConfig() {
  const dockerfile = `FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN pnpm build

# Expose port
EXPOSE 3000

# Start application
CMD ["pnpm", "start"]
`;

  const dockerCompose = `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - AFRICASTALKING_USERNAME=\${AFRICASTALKING_USERNAME}
      - AFRICASTALKING_API_KEY=\${AFRICASTALKING_API_KEY}
      - AFRICASTALKING_ENV=\${AFRICASTALKING_ENV}
      - AFRICASTALKING_SENDER_ID=\${AFRICASTALKING_SENDER_ID}
      - APP_URL=\${APP_URL}
      - DATABASE_URL=\${DATABASE_URL}
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=farmer_data
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

volumes:
  postgres_data:
`;

  const instructions = `
# Docker Deployment Configuration

## Setup Instructions

1. Install Docker:
   - Visit: https://docs.docker.com/get-docker/

2. Create \`.env\` file:
   \`\`\`bash
   cp .env.africastalking.template .env
   # Edit .env and fill in your credentials
   \`\`\`

3. Build and run:
   \`\`\`bash
   docker-compose up -d
   \`\`\`

4. View logs:
   \`\`\`bash
   docker-compose logs -f
   \`\`\`

5. Stop:
   \`\`\`bash
   docker-compose down
   \`\`\`

## Configuration Files

### Dockerfile

Save this as \`Dockerfile\`:

\`\`\`dockerfile
${dockerfile}
\`\`\`

### docker-compose.yml

Save this as \`docker-compose.yml\`:

\`\`\`yaml
${dockerCompose}
\`\`\`

## Production Deployment

For production, use a reverse proxy (nginx) for HTTPS:

\`\`\`yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
\`\`\`

## Webhook URLs

After deployment, configure these in Africa's Talking dashboard:

- USSD: https://your-domain.com/api/trpc/messaging.ussdCallback
- SMS: https://your-domain.com/api/trpc/messaging.smsCallback
- WhatsApp: https://your-domain.com/api/trpc/messaging.whatsappCallback
`;

  fs.writeFileSync('Dockerfile', dockerfile);
  fs.writeFileSync('docker-compose.yml', dockerCompose);
  fs.writeFileSync('DEPLOY_DOCKER.md', instructions);
  
  console.log('✅ Generated: Dockerfile, docker-compose.yml, DEPLOY_DOCKER.md');
}

function generateRailwayConfig() {
  const instructions = `
# Railway Deployment Configuration

## Setup Instructions

1. Visit Railway: https://railway.app/

2. Click "New Project" → "Deploy from GitHub repo"

3. Select your repository

4. Add environment variables:
   - Go to project → Variables
   - Add each variable:
${ENV_VARS.map(key => `     - ${key}: [Your value]`).join('\n')}

5. Add PostgreSQL:
   - Click "New" → "Database" → "PostgreSQL"
   - DATABASE_URL will be auto-configured

6. Deploy:
   - Railway auto-deploys on git push
   - View logs in dashboard

## Configuration

Railway auto-detects Node.js projects. No configuration file needed!

## Custom Start Command (Optional)

If needed, set in Railway dashboard → Settings → Start Command:

\`\`\`
pnpm start
\`\`\`

## Webhook URLs

After deployment, get your app URL from Railway dashboard, then configure in Africa's Talking:

- USSD: https://your-app.up.railway.app/api/trpc/messaging.ussdCallback
- SMS: https://your-app.up.railway.app/api/trpc/messaging.smsCallback
- WhatsApp: https://your-app.up.railway.app/api/trpc/messaging.whatsappCallback

## Custom Domain

1. Go to Settings → Domains
2. Add custom domain
3. Update DNS records as instructed
4. Update APP_URL environment variable
`;

  fs.writeFileSync('DEPLOY_RAILWAY.md', instructions);
  
  console.log('✅ Generated: DEPLOY_RAILWAY.md');
}

function generateRenderConfig() {
  const renderYaml = `services:
  - type: web
    name: farmer-data-collection
    env: node
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm start
    envVars:
      - key: AFRICASTALKING_USERNAME
        sync: false
      - key: AFRICASTALKING_API_KEY
        sync: false
      - key: AFRICASTALKING_ENV
        value: production
      - key: AFRICASTALKING_SENDER_ID
        sync: false
      - key: APP_URL
        sync: false
      - key: DATABASE_URL
        fromDatabase:
          name: farmer-data-db
          property: connectionString

databases:
  - name: farmer-data-db
    plan: starter
`;

  const instructions = `
# Render Deployment Configuration

## Setup Instructions

1. Visit Render: https://render.com/

2. Click "New +" → "Blueprint"

3. Connect your GitHub repository

4. Render will detect \`render.yaml\` and create services

5. Set environment variables:
   - Go to each service → Environment
   - Set secret values:
${ENV_VARS.filter(k => k !== 'AFRICASTALKING_ENV').map(key => `     - ${key}: [Your value]`).join('\n')}

6. Deploy:
   - Render auto-deploys on git push
   - View logs in dashboard

## Configuration File

Save this as \`render.yaml\`:

\`\`\`yaml
${renderYaml}
\`\`\`

## Manual Setup (Alternative)

If not using Blueprint:

1. New Web Service → Connect repository
2. Build Command: \`pnpm install && pnpm build\`
3. Start Command: \`pnpm start\`
4. Add PostgreSQL database
5. Link database to web service
6. Set environment variables

## Webhook URLs

After deployment, get your app URL from Render dashboard, then configure in Africa's Talking:

- USSD: https://your-app.onrender.com/api/trpc/messaging.ussdCallback
- SMS: https://your-app.onrender.com/api/trpc/messaging.smsCallback
- WhatsApp: https://your-app.onrender.com/api/trpc/messaging.whatsappCallback
`;

  fs.writeFileSync('render.yaml', renderYaml);
  fs.writeFileSync('DEPLOY_RENDER.md', instructions);
  
  console.log('✅ Generated: render.yaml, DEPLOY_RENDER.md');
}

function generateAllConfigs() {
  console.log('\n🚀 Generating deployment configurations for all platforms...\n');
  
  generateVercelConfig();
  generateHerokuConfig();
  generateDockerConfig();
  generateRailwayConfig();
  generateRenderConfig();
  
  console.log('\n✅ All deployment configurations generated!\n');
  console.log('Generated files:');
  console.log('  - vercel.json, DEPLOY_VERCEL.md');
  console.log('  - Procfile, DEPLOY_HEROKU.md');
  console.log('  - Dockerfile, docker-compose.yml, DEPLOY_DOCKER.md');
  console.log('  - DEPLOY_RAILWAY.md');
  console.log('  - render.yaml, DEPLOY_RENDER.md');
  console.log('\nChoose your preferred platform and follow the corresponding guide.\n');
}

function main() {
  console.clear();
  
  switch (platform.toLowerCase()) {
    case 'vercel':
      generateVercelConfig();
      break;
    case 'heroku':
      generateHerokuConfig();
      break;
    case 'docker':
      generateDockerConfig();
      break;
    case 'railway':
      generateRailwayConfig();
      break;
    case 'render':
      generateRenderConfig();
      break;
    case 'all':
      generateAllConfigs();
      break;
    default:
      console.error(`Unknown platform: ${platform}`);
      console.log('Available platforms: vercel, heroku, docker, railway, render, all');
      process.exit(1);
  }
}

main();
