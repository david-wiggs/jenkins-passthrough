# Jenkins Pipeline Credential Flow Diagram & Implementation

This project contains both the diagrams illustrating the Jenkins pipeline credential validation flow and a working implementation of the GitHub App / Business Logic Service.

## 📊 Diagrams

The diagrams show the complete flow of:
1. Jenkins pipeline with branch source plugin
2. Credential validation through business logic service
3. EntraID authentication
4. GitHub App token generation
5. Scoped repository access

### Available Diagram Formats

- `jenkins-flow-diagram.md` - Mermaid diagram in Markdown (GitHub/VS Code compatible)
- `jenkins-flow-diagram.puml` - PlantUML diagram
- `jenkins-flow-diagram.py` - Python script to generate diagram using Graphviz
- `ascii-diagram.md` - Simple ASCII flowchart
- `README.md` - This file

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

## 🛠️ Usage

### Viewing Diagrams

- **Mermaid**: Open `jenkins-flow-diagram.md` in VS Code (install Mermaid preview extension) or GitHub
- **PlantUML**: Use PlantUML extension in VS Code or online editor
- **Python/Graphviz**: Run `python jenkins-flow-diagram.py` to generate image files
- **ASCII**: View `ascii-diagram.md` for a simple text representation

### Running the Service

1. Configure the GitHub App and Azure/EntraID credentials
2. Install dependencies: `cd probot-app && npm install`
3. Build the project: `npm run build`
4. Start the API server: `npm run start:api`
5. Configure Jenkins to use the API endpoint

The service is now ready to handle Jenkins credential validation requests according to the flow shown in the diagrams!
