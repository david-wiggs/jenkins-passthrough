# Jenkins Credential Service - Probot App

A TypeScript-based Probot GitHub App that serves as a business logic service for Jenkins pipeline credential validation. This app validates credentials against EntraID, checks repository authorization, and generates scoped GitHub App installation tokens for Jenkins pipelines.

## Features

- 🔐 **EntraID Integration**: Validates user credentials against Azure Active Directory/EntraID
- 🛡️ **Repository Authorization**: Implements business logic to control repository access
- 🎯 **Scoped Tokens**: Generates GitHub App installation tokens scoped to specific repositories
- 🚀 **Express API**: Provides REST endpoints for Jenkins integration
- 📊 **Webhook Handling**: Listens to GitHub events for real-time updates
- 🔧 **TypeScript**: Fully typed for better development experience

## Architecture

This service implements the credential flow shown in your diagram:

1. Jenkins sends username/password + repository info
2. Service validates credentials with EntraID  
3. Service checks repository authorization
4. Service generates scoped GitHub App token
5. Returns token to Jenkins for repository operations

## Quick Start

### Prerequisites

- Node.js 18+ 
- A GitHub App with appropriate permissions
- Azure/EntraID application registration

### Installation

1. Clone and install dependencies:
```bash
cd probot-app
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Build and start the application:
```bash
npm run build
npm start
```

### Development

For development with hot reload:
```bash
npm run dev
```

## Configuration

### GitHub App Setup

1. Create a GitHub App in your organization settings
2. Configure permissions:
   - Repository permissions: Contents (read), Metadata (read), Pull requests (read)
   - Organization permissions: Members (read)
3. Generate and download a private key
4. Note the App ID and Webhook Secret

### Azure/EntraID Setup

1. Register an application in Azure AD
2. Configure API permissions for Microsoft Graph
3. Create a client secret
4. Note the Client ID, Tenant ID, and Client Secret

### Environment Variables

Copy `.env.example` to `.env` and configure:

- **GitHub App**: `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET`
- **Azure/EntraID**: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- **Authorization**: `AUTHORIZED_USERS`, `AUTHORIZED_REPOS` (comma-separated, use `*` for all)

## API Endpoints

### POST /api/validate-credentials

Main endpoint for Jenkins credential validation.

**Request:**
```json
{
  "username": "user@company.com",
  "password": "user_password",
  "repository": "my-repo",
  "organization": "my-org"
}
```

**Response (Success):**
```json
{
  "success": true,
  "token": "ghs_xxxxxxxxxxxx",
  "scopes": ["my-repo"],
  "expiresAt": "2024-01-01T12:00:00.000Z"
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Authentication failed"
}
```

### GET /api/status

Check service configuration and health.

### GET /api/ping

Simple connectivity test endpoint.

### GET /health

Health check endpoint.

## Jenkins Integration

Configure your Jenkins pipeline to call this service:

```groovy
pipeline {
    agent any
    
    stages {
        stage('Get GitHub Token') {
            steps {
                script {
                    def response = httpRequest(
                        httpMode: 'POST',
                        url: 'https://your-probot-app.com/api/validate-credentials',
                        contentType: 'APPLICATION_JSON',
                        requestBody: """
                        {
                            "username": "${env.GIT_USERNAME}",
                            "password": "${env.GIT_PASSWORD}",
                            "repository": "${env.GIT_REPO}",
                            "organization": "${env.GIT_ORG}"
                        }
                        """
                    )
                    
                    def json = readJSON text: response.content
                    
                    if (json.success) {
                        env.GITHUB_TOKEN = json.token
                    } else {
                        error("Credential validation failed: ${json.error}")
                    }
                }
            }
        }
        
        stage('Checkout') {
            steps {
                git(
                    url: "https://github.com/${env.GIT_ORG}/${env.GIT_REPO}.git",
                    credentialsId: 'github-token-credential'
                )
            }
        }
    }
}
```

## Customization

### Authorization Logic

Modify `src/services/credential-service.ts` to implement your specific authorization rules:

```typescript
private async checkRepositoryAuthorization(username: string, repository: string, organization?: string): Promise<boolean> {
    // Implement your custom authorization logic here
    // Examples:
    // - Check user groups in EntraID
    // - Query database for user permissions
    // - Check repository-specific access rules
    
    return true; // Replace with your logic
}
```

### EntraID Integration

Customize the EntraID authentication in `authenticateWithEntraID()` method to match your organization's setup.

## Development

### Scripts

- `npm run build` - Compile TypeScript
- `npm run dev` - Development with hot reload  
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Lint code

### Testing

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Test the API endpoint
curl -X POST http://localhost:3000/api/validate-credentials \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test","repository":"test-repo"}'
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY lib ./lib
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables for Production

Ensure these are set in your production environment:
- All Azure/GitHub configuration
- `NODE_ENV=production`
- `LOG_LEVEL=warn`
- Appropriate `ALLOWED_ORIGINS`

## Security Considerations

- 🔒 Always use HTTPS in production
- 🔑 Store private keys and secrets securely
- 🛡️ Implement rate limiting for API endpoints  
- 📝 Audit and log all credential validation attempts
- 🔄 Regularly rotate GitHub App private keys and Azure secrets
- 🚫 Never log sensitive credential information

## Troubleshooting

### Common Issues

1. **GitHub App permissions**: Ensure your app has the required repository and organization permissions
2. **EntraID configuration**: Verify client ID, secret, and tenant ID are correct
3. **Network connectivity**: Check firewall rules for GitHub webhooks and Azure API access
4. **Token expiration**: GitHub App tokens expire after 1 hour by default

### Logs

Check application logs for detailed error information:
```bash
npm start 2>&1 | tee app.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

ISC License - see LICENSE file for details.
