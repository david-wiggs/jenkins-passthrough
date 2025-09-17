# Jenkins Credential Service

A lightweight service that validates Jenkins credentials against EntraID and provides scoped GitHub tokens using Octokit.

## 🚀 Quick Start

```bash
cd probot-app
npm install
npm start
```

**Jenkins API URL:** `http://localhost:3000/api/validate-credentials`

## ✨ Features

- 🔐 **EntraID Authentication**: Validates credentials against Azure Active Directory
- 🛡️ **Repository Authorization**: Business logic controls for repository access  
- 🎯 **Scoped GitHub Tokens**: Real GitHub App installation tokens
- ⚡ **Single Server**: Lightweight Express API (no webhook complexity)
- 🔧 **TypeScript**: Fully typed for better development experience

<details>
<summary>📋 API Endpoints</summary>

### Main Endpoint
- `POST /api/validate-credentials` - Jenkins credential validation

### Monitoring
- `GET /health` - Health check
- `GET /api/status` - Service configuration and GitHub App status  
- `GET /api/ping` - Connectivity test

### Request Format
```json
{
  "username": "user@domain.com",
  "password": "user_password",
  "repository": "repo-name", 
  "organization": "org-name"
}
```

### Response Format
```json
{
  "success": true,
  "token": "ghs_real_github_installation_token",
  "scopes": ["contents:read", "metadata:read", "pull_requests:read"],
  "expiresAt": "2025-09-17T14:00:00.000Z"
}
```

</details>

<details>
<summary>⚙️ Configuration</summary>

Create `probot-app/.env`:

```bash
# GitHub App (for real tokens)
APP_ID=your_app_id
PRIVATE_KEY_PATH=private-key.pem

# Azure/EntraID  
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_TENANT_ID=your_tenant_id
ENTRAID_AUTH_METHOD=ropc

# API Configuration
PORT=3000
ALLOWED_ORIGINS=http://localhost:8080
AUTHORIZED_USERS=*
AUTHORIZED_REPOS=*
```

</details>

<details>
<summary>🔄 Authentication Flow</summary>

1. **Jenkins** → `POST /api/validate-credentials` with username/password + repo info
2. **Service** validates credentials with **EntraID** using ROPC flow
3. **Service** checks repository authorization rules
4. **GitHub App** generates scoped installation token via **Octokit**
5. **Jenkins** receives the scoped token for repository operations

### Security Features
- ✅ EntraID credential validation (ROPC, lookup, or mock modes)
- ✅ Repository-level authorization controls
- ✅ Scoped GitHub App installation tokens  
- ✅ No direct credential exposure to GitHub
- ✅ Centralized access control

</details>

<details>
<summary>🏗️ Architecture</summary>

**Previous:** Dual servers (Probot + Express)
**Current:** Single Express server with Octokit

```
┌─────────────────────────────────────┐
│          Express Server             │
│             Port 3000               │
├─────────────────────────────────────┤
│  Jenkins API Endpoints              │
│  • /api/validate-credentials        │
│  • /health, /api/status, /api/ping  │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │     Credential Service      │    │
│  │   (Azure + Authorization)   │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │      GitHub Service         │    │
│  │    (Octokit + App Auth)     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

**Benefits:**
- 🚀 Single server (simpler deployment)
- ⚡ Better performance (less overhead)
- 🎯 Purpose-built for Jenkins API

</details>

<details>
<summary>📖 Additional Documentation</summary>

- `probot-app/REFACTORING_SUMMARY.md` - Details on Probot → Octokit migration
- `probot-app/PROBOT_ONLY_ANALYSIS.md` - Analysis of using Probot vs Express  
- `jenkins-flow-diagram.md` - Interactive Mermaid flow diagram
- `probot-app/test-credentials.sh` - Test script for the API

</details>

## 🧪 Testing

```bash
# Test the API
curl -X POST http://localhost:3000/api/validate-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@domain.com",
    "password": "password",
    "repository": "repo-name",
    "organization": "org-name"
  }'
```

