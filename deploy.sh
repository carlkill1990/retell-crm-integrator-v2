#!/bin/bash

# Simple Hetzner deployment script that actually works
set -e

echo "🚀 Deploying Retell CRM Integrator to Hetzner"
echo "============================================="

# Install dependencies and build
echo "📦 Installing dependencies..."
npm install

echo "🔨 Building application..."
npm run build

# Setup database
echo "🗄️ Setting up database..."
npx prisma migrate deploy

# Start the application
echo "🎯 Starting application..."
nohup npm start > app.log 2>&1 &

echo "✅ Deployment complete!"
echo "🌐 Application running at: http://$(hostname -I | awk '{print $1}'):3000"