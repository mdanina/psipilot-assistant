#!/bin/bash

# ==============================================
# PsiPilot Assistant - Deployment Script
# ==============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== PsiPilot Assistant Deployment ===${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please copy deploy/.env.production.example to .env and configure it:"
    echo "  cp deploy/.env.production.example .env"
    echo "  nano .env"
    exit 1
fi

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed!${NC}"
    echo "Install Docker: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not available!${NC}"
    exit 1
fi

# Parse arguments
PRODUCTION=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --prod|--production) PRODUCTION=true ;;
        --build) BUILD=true ;;
        --down) docker compose down; exit 0 ;;
        --logs) docker compose logs -f; exit 0 ;;
        --help)
            echo "Usage: ./deploy/deploy.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --prod, --production  Use production config with SSL (Caddy)"
            echo "  --build              Force rebuild containers"
            echo "  --down               Stop and remove containers"
            echo "  --logs               Show container logs"
            echo "  --help               Show this help"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Choose compose file
if [ "$PRODUCTION" = true ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    echo -e "${YELLOW}Using production config with SSL${NC}"
else
    COMPOSE_FILE="docker-compose.yml"
    echo -e "${YELLOW}Using development config (HTTP only)${NC}"
fi

# Build and start
echo -e "${GREEN}Building and starting containers...${NC}"

if [ "$BUILD" = true ]; then
    docker compose -f $COMPOSE_FILE build --no-cache
fi

docker compose -f $COMPOSE_FILE up -d --build

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Services:"
docker compose -f $COMPOSE_FILE ps
echo ""
echo -e "${GREEN}Application is now running!${NC}"

if [ "$PRODUCTION" = true ]; then
    echo "Access: https://YOUR_DOMAIN (replace with your domain)"
else
    echo "Access: http://$(hostname -I | awk '{print $1}')"
fi

echo ""
echo "Useful commands:"
echo "  View logs:    docker compose -f $COMPOSE_FILE logs -f"
echo "  Stop:         docker compose -f $COMPOSE_FILE down"
echo "  Restart:      docker compose -f $COMPOSE_FILE restart"
