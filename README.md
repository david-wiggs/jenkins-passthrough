# Jenkins Pipeline Credential Flow Diagram & Implementation

This project contains both the diagrams illustrating the Jenkins pipeline credential validation flow and a working implementation of the GitHub App / Business Logic Service.


## 🚀 Implementation: Probot App

The `probot-app/` directory contains a complete TypeScript-based Probot GitHub App that implements the business logic service shown in the diagram.

### Features

- 🔐 **EntraID Integration**: Validates user credentials against Azure Active Directory
- 🛡️ **Repository Authorization**: Implements business logic to control repository access
- 🎯 **Scoped Tokens**: Generates GitHub App installation tokens scoped to specific repositories
- 🚀 **Express API**: Provides REST endpoints for Jenkins integration
- 📊 **Webhook Handling**: Listens to GitHub events for real-time updates
- 🔧 **TypeScript**: Fully typed for better development experience

### Quick Start

```bash
cd probot-app
npm install
npm run build
npm run start:api    # Start the API server
# or
npm run start        # Start the Probot webhook server
```

### API Endpoints

- `POST /api/validate-credentials` - Main endpoint for Jenkins credential validation
- `GET /api/status` - Service configuration and health
- `GET /api/ping` - Connectivity test
- `GET /health` - Health check

### Configuration

Copy `probot-app/.env.example` to `probot-app/.env` and configure:
- GitHub App credentials
- Azure/EntraID credentials
- Authorization rules

## 🔄 Flow Implementation

The Probot app implements exactly the flow shown in the diagrams:

1. **Jenkins** → `POST /api/validate-credentials` with username/password + repo info
2. **Business Logic Service** validates credentials with **EntraID**
3. **Business Logic Service** checks repository authorization
4. **GitHub App** generates scoped installation token
5. **Jenkins** receives the scoped token for repository operations

## 🔒 Security Features

- ✅ EntraID credential validation
- ✅ Repository-level authorization
- ✅ Scoped GitHub App tokens
- ✅ No direct credential exposure
- ✅ Centralized access control

## 📖 Documentation

- See `probot-app/README.md` for detailed implementation documentation
- See `jenkins-flow-diagram.md` for the interactive Mermaid diagram
- See individual diagram files for different format options

