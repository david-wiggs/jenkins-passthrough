# Jenkins Credential Service

A lightweight service that validates Jenkins credentials against EntraID and provides scoped GitHub tokens using dynamic permission matching.

## 📋 Overview

This service provides Jenkins with secure access to GitHub repositories by:

- **Dual Authentication Methods**: Supports both EntraID credential validation and GitHub Personal Access Token passthrough
- **Dynamic Authorization**: Uses real-time GitHub team permissions with intelligent pattern-based matching between EntraID groups and GitHub teams  
- **Permission Merging**: When users belong to multiple teams, automatically grants the highest permission level
- **Scoped Token Generation**: Creates GitHub App installation tokens with minimal required scopes based on user permissions
- **Enterprise Integration**: Built for organizations using EntraID for user management and GitHub for code repositories

## 🚀 Quick Start

```bash
cd app
npm install
npm start
```

**Jenkins API URL:** `http://localhost:3000/api/validate-credentials`

## ✨ Features

- 🔐 **EntraID Authentication**: Validates credentials against Azure Active Directory
- � **GitHub PAT Support**: Automatically detects and bypasses authentication for GitHub Personal Access Tokens
- 🛡️ **Dynamic Authorization**: Uses actual GitHub team permissions with intelligent pattern matching
- 🔄 **Permission Merging**: Automatically merges multiple team permissions to grant highest access level
- 🎯 **Scoped GitHub Tokens**: Real GitHub App installation tokens with appropriate scopes
- ⚡ **Single Server**: Lightweight Express API (no webhook complexity)
- 🔧 **TypeScript**: Fully typed for better development experience

---


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
  "password": "user_password_or_github_pat",
  "repository": "repo-name", 
  "organization": "org-name"
}
```

### Response Format
**Successful Authorization:**
```json
{
  "success": true,
  "token": "ghs_real_github_installation_token",
  "scopes": ["metadata:write", "contents:write", "issues:write", "pull_requests:write"],
  "permissions": "push",
  "userGroups": ["azgALMAP12345SVCDeveloper"],
  "matchingTeams": ["azgALMAP12345SCMDeveloper"]
}
```

**Authorization Failure:**
```json
{
  "success": false,
  "error": "The set of credentials that were supplied are not authorized for this repository",
  "userGroups": ["azgALMAP12345SVCReadOnly"],
  "matchingTeams": ["azgALMAP12345SCMReadOnly"]
}
```

**GitHub PAT Detection:**
```json
{
  "success": true,
  "token": "ghp_1234567890123456789012345678901234567890",
  "scopes": ["pat-passthrough"],
  "permissions": "pat",
  "userGroups": ["github-pat-user"],
  "matchingTeams": ["github-pat-bypass"]
}
```

</details>

<details>
<summary>⚙️ Configuration</summary>

Create `app/.env`:

```bash
# GitHub App (for real tokens)
APP_ID=your_app_id
PRIVATE_KEY_PATH=private-key.pem

# Azure/EntraID  
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
AZURE_TENANT_ID=your_tenant_id
ENTRAID_AUTH_METHOD=ropc

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Business Logic Configuration
# Regex patterns for EntraID groups and GitHub teams that determine permissions
# Groups/teams matching these patterns will be considered for permission calculation

# GROUP_PATTERN: Matches azgALM + project number + SVC + permission level
# Example: azgALMAP12345SVCDeveloper -> captures "AP12345" and "Developer"
GROUP_PATTERN=^azgALM(AP\d+)SVC(Developer|ReadOnly|Admin|Write|Maintainer)$

# TEAM_PATTERN: Matches azgALM + project number + SCM + permission level  
# Example: azgALMAP12345SCMDeveloper -> captures "AP12345" and "Developer"
TEAM_PATTERN=^azgALM(AP\d+)SCM(Developer|ReadOnly|Admin|Write|Maintainer)$
```

</details>

<details>
<summary>🔄 Authentication Flow</summary>

### Standard EntraID Flow
1. **Jenkins** → `POST /api/validate-credentials` with username/password + repo info
2. **Service** detects if password is a GitHub PAT (format: `gh[pours]_[a-zA-Z0-9/]{36}`)
3. **If PAT detected**: Returns PAT directly with bypass message
4. **If not PAT**: Validates credentials with **EntraID** using ROPC flow
5. **Service** retrieves user's EntraID groups and filters by `GROUP_PATTERN`
6. **Service** fetches repository teams and filters by `TEAM_PATTERN`
7. **Service** matches groups to teams using pattern-based matching (project + permission level)
8. **Service** merges permissions from multiple matching teams (grants highest permission)
9. **GitHub App** generates scoped installation token with appropriate permissions
10. **Jenkins** receives the scoped token with granted scopes listed

### Permission Matching Logic
- **Group Pattern**: `azgALMAP12345SVCDeveloper` → Project: `AP12345`, Permission: `Developer`
- **Team Pattern**: `azgALMAP12345SCMDeveloper` → Project: `AP12345`, Permission: `Developer`
- **Matching**: Groups and teams with same project + permission level are matched
- **Merging**: If user has multiple teams (e.g., Developer + ReadOnly), grants highest permission (Developer)
- **Hierarchy**: `pull < triage < push < maintain < admin` (GitHub standard)

### Security Features
- ✅ GitHub PAT auto-detection and passthrough
- ✅ EntraID credential validation (ROPC, lookup, or mock modes)
- ✅ Dynamic repository-level authorization using actual GitHub team permissions
- ✅ Permission merging for users with multiple team memberships
- ✅ Scoped GitHub App installation tokens with minimal required permissions
- ✅ No direct credential exposure to GitHub
- ✅ Centralized access control with pattern-based group/team matching

</details>

<details>
<summary>🏗️ Architecture</summary>

Single Express server with Octokit 

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
│  │  • GitHub PAT Detection     │    │
│  │  • Azure Authentication     │    │
│  │  • Pattern-Based Matching   │    │
│  │  • Permission Merging       │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │      GitHub Service         │    │
│  │  • Octokit Integration      │    │
│  │  • Dynamic Team Permissions │    │
│  │  • Installation Tokens      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

</details>

<details>
<summary>🧪 Testing</summary>

### Basic API Test
```bash
# Test with EntraID credentials
curl -X POST http://localhost:3000/api/validate-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@domain.com",
    "password": "password",
    "repository": "repo-name",
    "organization": "org-name"
  }'
```

### GitHub PAT Test
```bash
# Test with GitHub Personal Access Token (auto-detected)
curl -X POST http://localhost:3000/api/validate-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jenkins-user",
    "password": "ghp_1234567890123456789012345678901234567890",
    "repository": "my-repo",
    "organization": "my-org"
  }'
```

### Expected Responses

**Successful Authorization (EntraID):**
```json
{
  "success": true,
  "token": "ghs_installation_token_here",
  "scopes": ["metadata:write", "contents:write", "issues:write", "pull_requests:write"],
  "permissions": "push",
  "userGroups": ["azgALMAP12345SVCDeveloper"],
  "matchingTeams": ["azgALMAP12345SCMDeveloper"]
}
```

**GitHub PAT Passthrough:**
```json
{
  "success": true,
  "token": "ghp_1234567890123456789012345678901234567890",
  "scopes": ["pat-passthrough"],
  "permissions": "pat",
  "userGroups": ["github-pat-user"],
  "matchingTeams": ["github-pat-bypass"]
}
```

**Authorization Denied:**
```json
{
  "success": false,
  "error": "The set of credentials that were supplied are not authorized for this repository",
  "userGroups": ["azgALMAP12345SVCReadOnly"],
  "matchingTeams": ["azgALMAP12345SCMReadOnly"]
}
```

</details>

<details>
<summary>🔍 Key Features Explained</summary>

### GitHub PAT Detection
- Automatically detects GitHub Personal Access Tokens using regex: `gh[pours]_[a-zA-Z0-9/]{36}`
- Supports all GitHub token types: `ghp_` (classic), `gho_` (OAuth), `ghu_` (user), `ghr_` (refresh), `ghs_` (server-to-server)
- Bypasses all EntraID authentication when PAT is detected
- Returns PAT directly to Jenkins with special indicators

### Dynamic Permission System
- Uses actual GitHub repository team permissions instead of static mappings
- Fetches team permissions in real-time from GitHub API
- Merges permissions when users belong to multiple teams
- Grants highest permission level based on GitHub standard hierarchy

### Pattern-Based Matching
- Flexible regex patterns for matching EntraID groups to GitHub teams
- Supports project-based naming conventions (e.g., AP12345 project identifiers)
- Handles SVC (EntraID) vs SCM (GitHub) naming differences
- Configurable via environment variables

</details>

<details>
<summary>🔧 Troubleshooting</summary>

### Common Issues

**"The set of credentials that were supplied are not authorized"**
- Check if user's EntraID groups match the `GROUP_PATTERN` regex
- Verify GitHub teams exist and match the `TEAM_PATTERN` regex  
- Ensure group/team names follow the expected naming convention (same project ID and permission level)
- Check logs for group and team filtering details

**GitHub PAT not being detected**
- Verify PAT format: `gh[pours]_[a-zA-Z0-9/]{36}` (exactly 36 characters after prefix)
- Supported prefixes: `ghp_` (classic), `gho_` (OAuth), `ghu_` (user), `ghr_` (refresh), `ghs_` (server)
- Check logs for PAT detection messages

**Permission merging not working as expected**
- Review the GitHub permission hierarchy: `pull < triage < push < maintain < admin`
- Check logs for "Merged permissions" messages to see the merging logic
- Verify that multiple teams are actually matched for the user

### Debug Logging
Set log level to see detailed flow:
```bash
# Check group/team matching
grep "Found.*matching" logs
# Check permission calculation  
grep "Merged permissions\|Final merged permission" logs
# Check PAT detection
grep "GitHub PAT detected" logs
```

</details>

---

## 📚 Additional Documentation

- `app/ENTRAID_SETUP.md` - EntraID configuration guide
- `jenkins-flow-diagram.md` - Interactive Mermaid flow diagram  
- `app/test-service.js` - Test script for the API

