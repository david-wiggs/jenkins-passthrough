#!/bin/bash

# Test script for credential validation
# Replace the values below with real EntraID credentials

# Test credentials - replace with real values
USERNAME="jenkins1@h3liosoutlook.onmicrosoft.com"  # Replace with real EntraID username
PASSWORD="Ch33z3burg3r!"                           # Replace with real password  
REPOSITORY="bookstore"                             # Repository name to validate access for
ORGANIZATION="oodles-noodles"                      # Optional: GitHub organization

# API endpoint
API_URL="http://localhost:3000/api/validate-credentials"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing credential validation with EntraID integration...${NC}"
echo -e "${CYAN}Username: ${USERNAME}${NC}"

# Create JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
    "username": "${USERNAME}",
    "password": "${PASSWORD}",
    "repository": "${REPOSITORY}",
    "organization": "${ORGANIZATION}"
}
EOF
)

# Make the API request
echo -e "\n${YELLOW}Making API request...${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "${JSON_PAYLOAD}" \
    "${API_URL}")

# Extract HTTP status code and response body
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Validation successful!${NC}"
    echo -e "${GREEN}Response:${NC}"
    echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
    
    # Extract token info if jq is available
    if command -v jq &> /dev/null; then
        TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.token // empty')
        SCOPES=$(echo "$RESPONSE_BODY" | jq -r '.scopes // [] | join(", ")')
        EXPIRES_AT=$(echo "$RESPONSE_BODY" | jq -r '.expiresAt // empty')
        
        if [ -n "$TOKEN" ]; then
            echo -e "${CYAN}🎯 Generated token length: ${#TOKEN} characters${NC}"
            echo -e "${CYAN}🔐 Token scopes: ${SCOPES}${NC}"
            echo -e "${CYAN}⏰ Expires at: ${EXPIRES_AT}${NC}"
        fi
    fi
else
    echo -e "${RED}❌ Validation failed!${NC}"
    echo -e "${RED}HTTP Status Code: ${HTTP_CODE}${NC}"
    echo -e "${RED}Server response:${NC}"
    echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
fi

echo -e "\n${YELLOW}To test with different credentials, edit this file and run it again.${NC}"
