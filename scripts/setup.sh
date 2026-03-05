#!/bin/bash
set -e

# Interactive setup script for Delerium Paste
# This script guides users through configuring secrets and environment

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}"
echo "??????????????????????????????????????????????????"
echo "?                                                ?"
echo "?      ?? Delerium Paste Setup Wizard ??        ?"
echo "?                                                ?"
echo "?    Zero-Knowledge Encrypted Paste Service     ?"
echo "?                                                ?"
echo "??????????????????????????????????????????????????"
echo -e "${NC}"
echo ""

# Function to read user input with default value
read_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    if [ -n "$default" ]; then
        echo -e -n "${YELLOW}${prompt} ${NC}[${GREEN}${default}${NC}]: "
    else
        echo -e -n "${YELLOW}${prompt}: ${NC}"
    fi
    
    read user_input
    if [ -z "$user_input" ]; then
        eval "$var_name=\"$default\""
    else
        eval "$var_name=\"$user_input\""
    fi
}

# Function to generate random secret
generate_secret() {
    if command -v openssl > /dev/null 2>&1; then
        openssl rand -hex 32
    else
        # Fallback to /dev/urandom if openssl not available
        cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | fold -w 64 | head -n 1
    fi
}

echo -e "${BOLD}Step 1: Environment Setup${NC}"
echo "????????????????????????????????????????????????"
echo ""

# Ask for environment type
echo -e "${YELLOW}What environment are you setting up?${NC}"
echo "  1) Local Development"
echo "  2) Production/VPS"
echo ""
read_with_default "Choose option (1 or 2)" "1" "ENV_TYPE"

echo ""
echo -e "${BOLD}Step 2: Secrets Configuration${NC}"
echo "????????????????????????????????????????????????"
echo ""

# Check if .env already exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}??  An .env file already exists!${NC}"
    echo ""
    cat .env
    echo ""
    read_with_default "Do you want to overwrite it? (yes/no)" "no" "OVERWRITE"
    if [ "$OVERWRITE" != "yes" ] && [ "$OVERWRITE" != "y" ]; then
        echo -e "${GREEN}? Keeping existing .env file${NC}"
        echo ""
        USE_EXISTING=true
    fi
fi

if [ "$USE_EXISTING" != "true" ]; then
    echo -e "${BOLD}?? Deletion Token Pepper${NC}"
    echo "This secret is used to hash deletion tokens securely."
    echo "It should be a long random string that you keep secret."
    echo ""
    
    # Generate a random pepper
    GENERATED_PEPPER=$(generate_secret)
    
    echo -e "${GREEN}? Auto-generated a secure random pepper for you!${NC}"
    echo ""
    echo -e "Generated: ${BLUE}${GENERATED_PEPPER}${NC}"
    echo ""
    
    read_with_default "Use this generated pepper? (yes/no)" "yes" "USE_GENERATED"
    
    if [ "$USE_GENERATED" = "yes" ] || [ "$USE_GENERATED" = "y" ]; then
        DELETION_TOKEN_PEPPER="$GENERATED_PEPPER"
    else
        echo ""
        echo -e "${YELLOW}Enter your own secret pepper (64+ characters recommended):${NC}"
        read -s DELETION_TOKEN_PEPPER
        echo ""
        
        if [ ${#DELETION_TOKEN_PEPPER} -lt 32 ]; then
            echo -e "${RED}??  Warning: Your pepper is short (${#DELETION_TOKEN_PEPPER} chars). Recommended: 64+ chars${NC}"
            read_with_default "Continue anyway? (yes/no)" "no" "CONTINUE_SHORT"
            if [ "$CONTINUE_SHORT" != "yes" ]; then
                echo -e "${RED}Setup cancelled. Please run the script again.${NC}"
                exit 1
            fi
        fi
    fi
    
    echo ""
    
    # Optional: Domain and SSL (mainly for production)
    if [ "$ENV_TYPE" = "2" ]; then
        echo -e "${BOLD}?? Domain Configuration (Optional)${NC}"
        echo "If you're deploying to a VPS with a domain, enter it here."
        echo "Leave blank if running locally or without a domain."
        echo ""
        read_with_default "Domain name (e.g., paste.example.com)" "" "DOMAIN"
        
        if [ -n "$DOMAIN" ]; then
            echo ""
            echo -e "${BOLD}?? Let's Encrypt Email${NC}"
            echo "Required for automatic SSL certificate generation."
            echo ""
            read_with_default "Email for Let's Encrypt" "" "LETSENCRYPT_EMAIL"
        fi
    fi
    
    # Create .env file
    echo ""
    echo -e "${BOLD}Step 3: Writing Configuration${NC}"
    echo "????????????????????????????????????????????????"
    echo ""
    
    cat > .env << EOF
# Delerium Paste Environment Configuration
# Generated: $(date)
# Environment: $([ "$ENV_TYPE" = "1" ] && echo "Development" || echo "Production")

# REQUIRED: Secret pepper for deletion token hashing
# ?? KEEP THIS SECRET - Never commit to version control
# ?? Rotate this periodically for security
DELETION_TOKEN_PEPPER=${DELETION_TOKEN_PEPPER}
EOF
    
    if [ -n "$DOMAIN" ]; then
        cat >> .env << EOF

# Domain configuration
DOMAIN=${DOMAIN}
EOF
    fi
    
    if [ -n "$LETSENCRYPT_EMAIL" ]; then
        cat >> .env << EOF

# Let's Encrypt configuration
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
EOF
    fi
    
    echo -e "${GREEN}? Configuration saved to .env${NC}"
    echo ""
fi

# Display the configuration (hiding the secret)
echo -e "${BOLD}Step 4: Configuration Summary${NC}"
echo "????????????????????????????????????????????????"
echo ""

if [ -f ".env" ]; then
    echo -e "${GREEN}?? Your .env file:${NC}"
    echo ""
    # Show config with pepper hidden
    cat .env | while IFS= read -r line; do
        if [[ "$line" =~ ^DELETION_TOKEN_PEPPER= ]]; then
            echo "DELETION_TOKEN_PEPPER=************************** (hidden)"
        else
            echo "$line"
        fi
    done
    echo ""
fi

echo -e "${YELLOW}??  IMPORTANT SECURITY NOTES:${NC}"
echo "  ? The .env file is automatically excluded from git"
echo "  ? Never share your DELETION_TOKEN_PEPPER with anyone"
echo "  ? Store it securely (password manager recommended)"
echo "  ? Rotate it periodically for enhanced security"
echo ""

# Check prerequisites
echo -e "${BOLD}Step 5: Prerequisites Check${NC}"
echo "????????????????????????????????????????????????"
echo ""

MISSING_DEPS=false

# Check Docker
if command -v docker > /dev/null 2>&1; then
    if docker info > /dev/null 2>&1; then
        echo -e "${GREEN}? Docker is installed and running${NC}"
    else
        echo -e "${RED}? Docker is installed but not running${NC}"
        MISSING_DEPS=true
    fi
else
    echo -e "${RED}? Docker is not installed${NC}"
    echo -e "   Install from: ${BLUE}https://docs.docker.com/get-docker/${NC}"
    MISSING_DEPS=true
fi

# Check Docker Compose
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
    echo -e "${GREEN}? Docker Compose is available${NC}"
elif command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
    echo -e "${GREEN}? Docker Compose is available${NC}"
else
    echo -e "${RED}? Docker Compose is not available${NC}"
    MISSING_DEPS=true
fi

echo ""

if [ "$MISSING_DEPS" = true ]; then
    echo -e "${RED}? Missing prerequisites. Please install them and run this script again.${NC}"
    exit 1
fi

# Ask to start services
echo -e "${BOLD}Step 6: Start Services${NC}"
echo "????????????????????????????????????????????????"
echo ""

read_with_default "Do you want to start the services now? (yes/no)" "yes" "START_SERVICES"

if [ "$START_SERVICES" = "yes" ] || [ "$START_SERVICES" = "y" ]; then
    echo ""
    echo -e "${BLUE}?? Starting Docker containers...${NC}"
    echo ""
    
    $DOCKER_COMPOSE up -d --build
    
    echo ""
    echo -e "${BLUE}? Waiting for services to start...${NC}"
    sleep 5
    
    # Health check
    echo ""
    HEALTH_OK=true
    
    if curl -s http://localhost:8080/ > /dev/null 2>&1; then
        echo -e "${GREEN}? Frontend is accessible${NC}"
    else
        echo -e "${YELLOW}??  Frontend might not be ready yet${NC}"
        HEALTH_OK=false
    fi
    
    if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}? Backend API is responding${NC}"
    else
        echo -e "${YELLOW}??  Backend API might not be ready yet${NC}"
        HEALTH_OK=false
    fi
    
    echo ""
    echo -e "${BOLD}?? Container Status:${NC}"
    $DOCKER_COMPOSE ps
    echo ""
fi

# Final success message
echo -e "${GREEN}${BOLD}"
echo "??????????????????????????????????????????????????"
echo "?                                                ?"
echo "?     ? Setup Complete! ?                     ?"
echo "?                                                ?"
echo "??????????????????????????????????????????????????"
echo -e "${NC}"
echo ""

if [ "$START_SERVICES" = "yes" ] || [ "$START_SERVICES" = "y" ]; then
    echo -e "${BOLD}?? Access your application:${NC}"
    echo -e "   ${BLUE}http://localhost:8080${NC}"
    echo ""
fi

echo -e "${BOLD}?? Useful commands:${NC}"
echo "   docker compose up -d    - Start services"
echo "   docker compose down     - Stop services"
echo "   docker compose logs     - View logs"
echo "   docker compose ps       - Check status"
echo ""

echo -e "${BOLD}?? Next steps:${NC}"
echo "   ? Read the README.md for detailed documentation"
echo "   ? Check SECURITY_CHECKLIST.md for security best practices"
echo "   ? For production deployment, see docs/deployment/DEPLOYMENT.md"
echo ""

# Open browser if in graphical environment
if [ "$START_SERVICES" = "yes" ] || [ "$START_SERVICES" = "y" ]; then
    if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ] || [ "$(uname)" = "Darwin" ]; then
        if [ -z "$HEADLESS" ] && [ -z "$NO_BROWSER" ]; then
            echo -e "${YELLOW}Open browser now? (yes/no)${NC}: "
            read OPEN_BROWSER
            if [ "$OPEN_BROWSER" = "yes" ] || [ "$OPEN_BROWSER" = "y" ]; then
                if command -v open > /dev/null 2>&1; then
                    open http://localhost:8080
                elif command -v xdg-open > /dev/null 2>&1; then
                    xdg-open http://localhost:8080
                fi
            fi
        fi
    fi
fi

echo ""
echo -e "${GREEN}Happy pasting! ??${NC}"
echo ""
