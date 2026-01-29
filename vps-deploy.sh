#!/bin/bash

#############################################
# Task Management App - VPS Deployment Script
# For Ubuntu 20.04/22.04 with 4GB RAM
#############################################

set -e  # Exit on any error

echo "🚀 Starting Task Management App Deployment"
echo "=========================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${1:-your-domain.com}"
BACKEND_REPO="https://github.com/thestudycafesagar/task-management-backend.git"
FRONTEND_REPO="https://github.com/thestudycafesagar/task-management-frontend.git"
DEPLOY_DIR="/var/www"

echo -e "${YELLOW}Domain: ${DOMAIN}${NC}"
echo ""

# Step 1: Update system
echo -e "${GREEN}[1/10] Updating system packages...${NC}"
apt-get update
apt-get upgrade -y

# Step 2: Install Node.js 20.x
echo -e "${GREEN}[2/10] Installing Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Step 3: Install PM2
echo -e "${GREEN}[3/10] Installing PM2 process manager...${NC}"
npm install -g pm2

# Step 4: Install Nginx
echo -e "${GREEN}[4/10] Installing Nginx...${NC}"
apt-get install -y nginx

# Step 5: Install Git
echo -e "${GREEN}[5/10] Installing Git...${NC}"
apt-get install -y git

# Step 6: Create deployment directory
echo -e "${GREEN}[6/10] Setting up deployment directory...${NC}"
mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# Step 7: Clone and setup Backend
echo -e "${GREEN}[7/10] Cloning and setting up Backend...${NC}"
if [ -d "task-management-backend" ]; then
    echo "Backend directory exists, pulling latest changes..."
    cd task-management-backend
    git pull
else
    git clone $BACKEND_REPO task-management-backend
    cd task-management-backend
fi

echo "Installing backend dependencies..."
npm install --production

echo -e "${YELLOW}⚠️  Please create .env file in: ${DEPLOY_DIR}/task-management-backend/.env${NC}"
echo "Press Enter after you've created the .env file with your configuration..."
read -p ""

# Start backend with PM2
echo "Starting backend with PM2..."
pm2 delete task-backend 2>/dev/null || true
pm2 start src/server.js --name task-backend --node-args="--max-old-space-size=1024"
pm2 save

# Step 8: Clone and setup Frontend
echo -e "${GREEN}[8/10] Cloning and setting up Frontend...${NC}"
cd $DEPLOY_DIR

if [ -d "task-management-frontend" ]; then
    echo "Frontend directory exists, pulling latest changes..."
    cd task-management-frontend
    git pull
else
    git clone $FRONTEND_REPO task-management-frontend
    cd task-management-frontend
fi

echo "Installing frontend dependencies..."
npm install

echo -e "${YELLOW}⚠️  Please create .env.local file in: ${DEPLOY_DIR}/task-management-frontend/.env.local${NC}"
echo "It should contain: NEXT_PUBLIC_API_URL=http://${DOMAIN}/api"
echo "Press Enter after you've created the .env.local file..."
read -p ""

echo "Building frontend..."
npm run build

# Start frontend with PM2
echo "Starting frontend with PM2..."
pm2 delete task-frontend 2>/dev/null || true
pm2 start npm --name task-frontend -- start
pm2 save

# Step 9: Configure Nginx
echo -e "${GREEN}[9/10] Configuring Nginx...${NC}"

cat > /etc/nginx/sites-available/task-management << EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 10M;

    # Frontend - Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Socket.IO
    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/task-management /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx

# Step 10: Setup PM2 startup
echo -e "${GREEN}[10/10] Configuring PM2 to start on boot...${NC}"
pm2 startup systemd -u root --hp /root
pm2 save

# Install SSL (Optional but recommended)
echo -e "${YELLOW}Would you like to install SSL certificate? (y/n)${NC}"
read -p "" install_ssl

if [ "$install_ssl" = "y" ]; then
    echo "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
    
    echo "Obtaining SSL certificate..."
    certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN}
    
    echo "Setting up auto-renewal..."
    systemctl enable certbot.timer
    systemctl start certbot.timer
fi

echo ""
echo -e "${GREEN}=========================================="
echo "✅ Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "📊 Service Status:"
pm2 status
echo ""
echo "🌐 Your app is running at:"
echo "   http://${DOMAIN}"
if [ "$install_ssl" = "y" ]; then
    echo "   https://${DOMAIN}"
fi
echo ""
echo "📝 Useful Commands:"
echo "   pm2 status          - Check app status"
echo "   pm2 logs            - View logs"
echo "   pm2 restart all     - Restart apps"
echo "   pm2 monit           - Monitor resources"
echo "   nginx -t            - Test Nginx config"
echo "   systemctl status nginx - Check Nginx status"
echo ""
echo "🔄 To update your app:"
echo "   cd ${DEPLOY_DIR}/task-management-backend && git pull && pm2 restart task-backend"
echo "   cd ${DEPLOY_DIR}/task-management-frontend && git pull && npm run build && pm2 restart task-frontend"
echo ""
echo -e "${YELLOW}⚠️  Don't forget to:${NC}"
echo "   1. Update CORS_ORIGIN in backend .env to: http://${DOMAIN}"
echo "   2. Update NEXT_PUBLIC_API_URL in frontend .env.local to: http://${DOMAIN}/api"
echo "   3. Configure your domain DNS to point to this server IP"
echo ""
