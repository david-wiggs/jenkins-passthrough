import { ConfidentialClientApplication, PublicClientApplication, Configuration } from "@azure/msal-node";
import jwt from "jsonwebtoken";
import { gitHubService } from "./github-service";

export interface CredentialValidationRequest {
  username: string;
  password: string;
  repository: string;
  organization?: string;
}

export interface CredentialValidationResponse {
  success: boolean;
  token?: string;
  error?: string;
  scopes?: string[];
  permissions?: string;
  userGroups?: string[];
  matchingTeams?: string[];
}

export interface EntraIDGroup {
  id: string;
  name: string;
  description?: string;
}

export interface GitHubTeamPermission {
  name: string;
  permission: string;
  slug: string;
}

export interface AuthenticationResult {
  success: boolean;
  accessToken?: string;
  error?: string;
}

class CredentialService {
  private gitHubInitialized = false;
  private msalInstance: ConfidentialClientApplication | null = null;
  private publicMsalInstance: PublicClientApplication | null = null;
  private gitHubService = gitHubService;
  
  private config = {
    groupPattern: undefined as string | undefined,
    teamPattern: undefined as string | undefined
  };

  initialize() {
    // Load config from environment variables after dotenv has loaded them
    this.config.groupPattern = process.env.GROUP_PATTERN;
    this.config.teamPattern = process.env.TEAM_PATTERN;
    
    this.safeLog("debug", `Loaded GROUP_PATTERN: ${this.config.groupPattern}`);
    this.safeLog("debug", `Loaded TEAM_PATTERN: ${this.config.teamPattern}`);
    
    this.initializeMsal();
    this.gitHubInitialized = gitHubService.initializeFromEnv();
  }

  // Initialize for standalone mode (legacy support)
  initializeStandalone() {
    this.initialize();
  }

  private safeLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
    // Simple console logging since we're not using Probot anymore
    const logMethod = level === 'debug' ? 'log' : level;
    console[logMethod as 'log' | 'info' | 'warn' | 'error'](`[${level.toUpperCase()}]`, message, data || '');
  }

  private initializeMsal() {
    const authority = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || "common"}`;
    
    // Confidential Client Application for app-only operations
    const confidentialConfig: Configuration = {
      auth: {
        clientId: process.env.AZURE_CLIENT_ID || "",
        clientSecret: process.env.AZURE_CLIENT_SECRET || "",
        authority: authority,
      },
    };

    // Public Client Application for ROPC flow
    const publicConfig: Configuration = {
      auth: {
        clientId: process.env.AZURE_CLIENT_ID || "",
        authority: authority,
      },
    };

    if (process.env.AZURE_CLIENT_ID) {
      // Initialize confidential client for app-only operations
      if (process.env.AZURE_CLIENT_SECRET) {
        this.msalInstance = new ConfidentialClientApplication(confidentialConfig);
        this.safeLog('info', "MSAL Confidential Client initialized successfully");
      }
      
      // Initialize public client for ROPC operations
      this.publicMsalInstance = new PublicClientApplication(publicConfig);
      this.safeLog('info', "MSAL Public Client initialized successfully for ROPC");
    } else {
      this.safeLog('warn', "MSAL not initialized - missing Azure configuration");
    }
  }

  /**
   * Validates credentials against EntraID and checks repository authorization
   */
  async validateCredentials(request: CredentialValidationRequest): Promise<CredentialValidationResponse> {
    try {
      this.safeLog("info", `Validating credentials for user: ${request.username}, repo: ${request.repository}`);

      // Step 1: Authenticate with EntraID and get access token
      const authResult = await this.authenticateWithEntraID(request.username, request.password);
      
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error || "Authentication failed"
        };
      }

      if (!authResult.accessToken) {
        this.safeLog("error", "No access token available for user group lookup");
        return {
          success: false,
          error: "Access token not available"
        };
      }

      // Step 2: Get user groups from EntraID
      const userGroups = await this.getUserGroups(authResult.accessToken);

      // Step 3: Filter groups by pattern
      const matchingGroups = this.filterGroupsByPattern(userGroups);
      this.safeLog("info", `Found ${matchingGroups.length} matching groups: ${matchingGroups.map(g => g.name).join(', ')}`);

      // Step 4: Get repository teams
      const repoTeams = await this.getRepositoryTeams(request.organization || 'default-org', request.repository);

      // Step 5: Filter teams by pattern
      const matchingTeams = this.filterTeamsByPattern(repoTeams);
      this.safeLog("info", `Found ${matchingTeams.length} matching teams: ${matchingTeams.map(t => t.name).join(', ')}`);

      // Step 6: Calculate permissions based on group-team matching
      const permission = this.calculatePermissions(matchingGroups, matchingTeams);
      
      // Check if user is authorized (has matching groups/teams)
      if (!permission) {
        this.safeLog("warn", `User ${request.username} is not authorized for repository ${request.repository} - no matching groups/teams found`);
        return {
          success: false,
          error: "User not authorized - no matching EntraID groups and GitHub teams found",
          userGroups: matchingGroups.map(g => g.name),
          matchingTeams: matchingTeams.map(t => t.name)
        };
      }

      this.safeLog("info", `Calculated required permissions: ${permission}`);

      // Step 7: Generate token scopes
      const scopes = this.getTokenScopes(permission);

      // Step 8: Generate GitHub token with calculated permissions
      const githubToken = await this.generateScopedToken(request.repository, request.organization);

      if (!githubToken) {
        this.safeLog("error", "Failed to generate GitHub token");
        return {
          success: false,
          error: "Token generation failed"
        };
      }

      return {
        success: true,
        token: githubToken,
        scopes,
        permissions: permission,
        userGroups: matchingGroups.map(g => g.name),
        matchingTeams: matchingTeams.map(t => t.name)
      };

    } catch (error) {
      this.safeLog("error", "Error validating credentials:", error);
      return {
        success: false,
        error: "Internal server error"
      };
    }
  }

  /**
   * Authenticates user credentials against EntraID
   */
  private async authenticateWithEntraID(username: string, password: string): Promise<AuthenticationResult> {
    try {
      const authMethod = process.env.ENTRAID_AUTH_METHOD || "lookup";
      
      switch (authMethod) {
        case "mock":
          return this.mockAuthentication(username, password);
        case "lookup":
          return this.userLookupAuthentication(username);
        case "ropc":
          return this.fullROPCAuthentication(username, password);
        default:
          this.safeLog("warn", `Unknown auth method: ${authMethod}, falling back to lookup`);
          return this.userLookupAuthentication(username);
      }
    } catch (error) {
      this.safeLog("error", "EntraID authentication error:", error);
      return { success: false, error: "Authentication error" };
    }
  }

  /**
   * Mock authentication for development/testing
   */
  private async mockAuthentication(username: string, password: string): Promise<AuthenticationResult> {
    const validUsers = process.env.TEST_VALID_USERS?.split(",") || [];
    const isValidUser = validUsers.includes(username) || validUsers.includes("*");
    
    this.safeLog("info", `Mock authentication for ${username}: ${isValidUser ? "SUCCESS" : "FAILED"}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (isValidUser) {
      return { 
        success: true, 
        accessToken: "mock_access_token_" + Math.random().toString(36).substring(2) 
      };
    } else {
      return { success: false, error: "Invalid credentials" };
    }
  }

  /**
   * User lookup authentication - validates user exists in EntraID
   */
  private async userLookupAuthentication(username: string): Promise<AuthenticationResult> {
    if (!this.msalInstance) {
      this.safeLog("warn", "MSAL not configured, falling back to mock auth");
      if (process.env.NODE_ENV === "development") {
        return { 
          success: true, 
          accessToken: "lookup_mock_token_" + Math.random().toString(36).substring(2) 
        };
      } else {
        return { success: false, error: "MSAL not configured" };
      }
    }

    try {
      // Get app-only token for Microsoft Graph
      const clientCredentialRequest = {
        scopes: ["https://graph.microsoft.com/.default"],
      };

      const response = await this.msalInstance.acquireTokenByClientCredential(clientCredentialRequest);
      
      if (response?.accessToken) {
        // Use the access token to look up the user
        const userExists = await this.lookupUserInGraph(response.accessToken, username);
        this.safeLog("info", `User lookup for ${username}: ${userExists ? "FOUND" : "NOT_FOUND"}`);
        
        if (userExists) {
          return { success: true, accessToken: response.accessToken };
        } else {
          return { success: false, error: "User not found in directory" };
        }
      }

      return { success: false, error: "Failed to acquire access token" };
    } catch (error: any) {
      this.safeLog("error", "User lookup authentication error:", error);
      return { success: false, error: error.message || "Authentication failed" };
    }
  }

  /**
   * Full Resource Owner Password Credentials authentication
   */
  private async fullROPCAuthentication(username: string, password: string): Promise<AuthenticationResult> {
    if (!this.publicMsalInstance) {
      this.safeLog("warn", "MSAL Public Client not configured for ROPC");
      return { success: false, error: "ROPC not configured" };
    }

    try {
      this.safeLog("info", `Attempting ROPC authentication for user: ${username}`);
      
      // ROPC (Resource Owner Password Credentials) flow using Public Client
      const usernamePasswordRequest = {
        scopes: ["https://graph.microsoft.com/User.Read"],
        username: username,
        password: password,
      };

      this.safeLog("debug", "Acquiring token using ROPC flow...");
      const response = await this.publicMsalInstance.acquireTokenByUsernamePassword(usernamePasswordRequest);
      
      if (response && response.accessToken) {
        this.safeLog("info", `ROPC authentication successful for user: ${username}`);
        this.safeLog("debug", `Access token acquired, expires at: ${new Date(response.expiresOn || 0).toISOString()}`);
        
        // Optionally verify the token by making a Graph API call
        const isValidUser = await this.verifyTokenWithGraph(response.accessToken, username);
        
        if (isValidUser) {
          this.safeLog("info", `Token verification successful for user: ${username}`);
          return { success: true, accessToken: response.accessToken };
        } else {
          this.safeLog("warn", `Token verification failed for user: ${username}`);
          return { success: false, error: "Token verification failed" };
        }
      } else {
        this.safeLog("warn", `ROPC authentication failed: No access token received for user: ${username}`);
        return { success: false, error: "No access token received" };
      }
    } catch (error: any) {
      this.safeLog("error", `ROPC authentication error for user ${username}:`, {
        error: error.message,
        errorCode: error.errorCode,
        errorDescription: error.errorDescription,
        correlationId: error.correlationId
      });
      
      // Log specific ROPC-related errors
      if (error.errorCode === "invalid_grant") {
        this.safeLog("error", "ROPC Error: Invalid username/password or user account may be disabled/locked");
      } else if (error.errorCode === "unauthorized_client") {
        this.safeLog("error", "ROPC Error: Application not authorized for ROPC flow. Check Azure app registration settings.");
      } else if (error.errorCode === "unsupported_grant_type") {
        this.safeLog("error", "ROPC Error: ROPC flow not enabled in tenant. Contact Azure admin to enable ROPC.");
      } else if (error.errorCode === "invalid_request") {
        this.safeLog("error", "ROPC Error: Invalid request. Check that the application is configured as a public client.");
      }
      
      return { success: false, error: error.message || "Authentication failed" };
    }
  }

  /**
   * Verify the acquired token by making a simple Graph API call
   */
  private async verifyTokenWithGraph(accessToken: string, expectedUsername: string): Promise<boolean> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const userInfo = await response.json() as any;
        this.safeLog("debug", `Graph API verification successful: ${userInfo.displayName} (${userInfo.userPrincipalName})`);
        
        // Verify the username matches what we expect
        const userPrincipalName = userInfo.userPrincipalName?.toLowerCase();
        const expectedUsernameLower = expectedUsername.toLowerCase();
        
        if (userPrincipalName === expectedUsernameLower) {
          return true;
        } else {
          this.safeLog("warn", `Username mismatch: expected ${expectedUsername}, got ${userPrincipalName}`);
          return false;
        }
      } else {
        this.safeLog("error", `Graph API verification failed: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      this.safeLog("error", "Graph API verification error:", error);
      return false;
    }
  }

  /**
   * Look up user in Microsoft Graph
   */
  private async lookupUserInGraph(accessToken: string, username: string): Promise<boolean> {
    try {
      const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(username)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const user = await response.json() as any;
        this.safeLog("info", `Found user in Graph: ${user.displayName} (${user.userPrincipalName})`);
        return true;
      } else if (response.status === 404) {
        this.safeLog("info", `User not found in Graph: ${username}`);
        return false;
      } else {
        this.safeLog("error", `Graph API error: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      this.safeLog("error", "Graph API lookup error:", error);
      return false;
    }
  }

  /**
   * Get user groups from EntraID using Microsoft Graph API
   */
  private async getUserGroups(accessToken: string): Promise<EntraIDGroup[]> {
    try {
      this.safeLog("debug", "Fetching user groups from Microsoft Graph API");
      
      const response = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName,description', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        this.safeLog("error", `Failed to fetch user groups: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json() as { value: any[] };
      
      // Filter only groups (not directory roles or other objects)
      const groups: EntraIDGroup[] = data.value
        .filter((item: any) => item['@odata.type'] === '#microsoft.graph.group')
        .map((group: any) => ({
          id: group.id,
          name: group.displayName,
          description: group.description || ''
        }));

      this.safeLog("debug", `Retrieved ${groups.length} groups for user`);
      return groups;
    } catch (error: any) {
      this.safeLog("error", "Error fetching user groups:", error.message);
      return [];
    }
  }

  /**
   * Filter groups by configured regex pattern
   */
  private filterGroupsByPattern(groups: EntraIDGroup[]): EntraIDGroup[] {
    if (!this.config.groupPattern) {
      this.safeLog("warn", "No GROUP_PATTERN configured, returning all groups");
      return groups;
    }

    try {
      const regex = new RegExp(this.config.groupPattern, 'i');
      const filteredGroups = groups.filter(group => regex.test(group.name));
      
      this.safeLog("debug", `Filtered ${groups.length} groups to ${filteredGroups.length} matching pattern: ${this.config.groupPattern}`);
      return filteredGroups;
    } catch (error: any) {
      this.safeLog("error", `Invalid GROUP_PATTERN regex: ${this.config.groupPattern}`, error.message);
      return groups; // Return all groups if pattern is invalid
    }
  }

  /**
   * Get repository teams from GitHub
   */
  private async getRepositoryTeams(repositoryOwner: string, repositoryName: string): Promise<GitHubTeamPermission[]> {
    try {
      this.safeLog("debug", `Fetching teams for repository: ${repositoryOwner}/${repositoryName}`);
      
      const teams = await this.gitHubService.getRepositoryTeams(repositoryOwner, repositoryName);
      
      const teamPermissions: GitHubTeamPermission[] = teams.map((team: any) => ({
        name: team.name,
        permission: team.permission || 'read', // Default to read if permission not specified
        slug: team.slug
      }));

      this.safeLog("debug", `Retrieved ${teamPermissions.length} teams for repository`);
      return teamPermissions;
    } catch (error: any) {
      this.safeLog("error", `Error fetching repository teams for ${repositoryOwner}/${repositoryName}:`, error.message);
      return [];
    }
  }

  /**
   * Filter teams by configured regex pattern
   */
  private filterTeamsByPattern(teams: GitHubTeamPermission[]): GitHubTeamPermission[] {
    if (!this.config.teamPattern) {
      this.safeLog("warn", "No TEAM_PATTERN configured, returning all teams");
      return teams;
    }

    try {
      const regex = new RegExp(this.config.teamPattern, 'i');
      const filteredTeams = teams.filter(team => regex.test(team.name));
      
      this.safeLog("debug", `Filtered ${teams.length} teams to ${filteredTeams.length} matching pattern: ${this.config.teamPattern}`);
      return filteredTeams;
    } catch (error: any) {
      this.safeLog("error", `Invalid TEAM_PATTERN regex: ${this.config.teamPattern}`, error.message);
      return teams; // Return all teams if pattern is invalid
    }
  }

  /**
   * Calculate the highest permission level based on group-team matching
   * Returns null if no matches are found (authorization failure)
   */
  private calculatePermissions(filteredGroups: EntraIDGroup[], filteredTeams: GitHubTeamPermission[]): string | null {
    this.safeLog("debug", `Calculating permissions from ${filteredGroups.length} groups and ${filteredTeams.length} teams`);
    
    // AUTHORIZATION DENIAL: If no matching groups or teams, deny access
    if (filteredGroups.length === 0 || filteredTeams.length === 0) {
      this.safeLog("warn", "Authorization denied: No matching groups or teams found");
      return null;
    }

    // Permission hierarchy (highest to lowest)
    const permissionLevels = ['admin', 'maintain', 'push', 'triage', 'pull', 'read'];
    let highestPermission = 'read';
    let foundMatch = false;

    // Look for group-team matches using configured patterns
    for (const group of filteredGroups) {
      for (const team of filteredTeams) {
        let isMatch = false;
        const groupLower = group.name.toLowerCase();
        const teamLower = team.name.toLowerCase();
        
        // Method 1: Direct substring matching
        if (groupLower.includes(teamLower) || teamLower.includes(groupLower)) {
          isMatch = true;
        }
        
        // Method 2: Use configured patterns to extract permission levels and compare
        if (!isMatch && this.config.groupPattern && this.config.teamPattern) {
          try {
            const groupRegex = new RegExp(this.config.groupPattern, 'i');
            const teamRegex = new RegExp(this.config.teamPattern, 'i');
            
            const groupMatch = group.name.match(groupRegex);
            const teamMatch = team.name.match(teamRegex);
            
            // If both match the patterns, extract the permission level (capture group 1)
            if (groupMatch && teamMatch && groupMatch[1] && teamMatch[1]) {
              const groupPermission = groupMatch[1].toLowerCase();
              const teamPermission = teamMatch[1].toLowerCase();
              
              // Match if same permission level
              if (groupPermission === teamPermission) {
                isMatch = true;
                this.safeLog("debug", `Found pattern-based match: Group "${group.name}" (${groupPermission}) <-> Team "${team.name}" (${teamPermission})`);
              }
            }
          } catch (error: any) {
            this.safeLog("error", "Error in pattern-based matching:", error.message);
          }
        }
        
        if (isMatch) {
          this.safeLog("debug", `Found match: Group "${group.name}" <-> Team "${team.name}" (${team.permission})`);
          foundMatch = true;
          
          // Update to highest permission found
          const currentPermissionIndex = permissionLevels.indexOf(team.permission);
          const highestPermissionIndex = permissionLevels.indexOf(highestPermission);
          
          if (currentPermissionIndex < highestPermissionIndex) {
            highestPermission = team.permission;
            this.safeLog("debug", `Updated highest permission to: ${highestPermission}`);
          }
        }
      }
    }

    // AUTHORIZATION DENIAL: If groups and teams exist but no name matches found
    if (!foundMatch) {
      this.safeLog("warn", "Authorization denied: No matching group/team names found");
      return null;
    }

    this.safeLog("info", `Final calculated permission: ${highestPermission}`);
    return highestPermission;
  }

  /**
   * Generate token scopes based on permission level
   */
  private getTokenScopes(permission: string): string[] {
    const scopes: string[] = [];
    
    switch (permission.toLowerCase()) {
      case 'admin':
        scopes.push('repo', 'admin:repo_hook', 'delete_repo');
        break;
      case 'maintain':
        scopes.push('repo', 'admin:repo_hook');
        break;
      case 'push':
        scopes.push('repo');
        break;
      case 'triage':
        scopes.push('repo:status', 'repo_deployment');
        break;
      case 'pull':
      case 'read':
      default:
        scopes.push('repo:status', 'public_repo');
        break;
    }

    this.safeLog("debug", `Generated scopes for permission '${permission}': ${scopes.join(', ')}`);
    return scopes;
  }

  /**
   * Checks if the user is authorized to access the specific repository
   */
  private async checkRepositoryAuthorization(username: string, repository: string, organization?: string): Promise<boolean> {
    try {
      // This is where you implement your business logic for repository authorization
      // Examples of authorization checks:
      // 1. Check user's group membership in EntraID
      // 2. Check against a database of authorized users/repos
      // 3. Check repository-specific permissions
      
      this.safeLog("info", `Checking authorization for ${username} on ${organization || ""}/${repository}`);
      
      // Placeholder implementation - replace with your actual authorization logic
      const authorizedUsers = process.env.AUTHORIZED_USERS?.split(",") || [];
      const isUserAuthorized = authorizedUsers.includes(username) || authorizedUsers.includes("*");
      
      const authorizedRepos = process.env.AUTHORIZED_REPOS?.split(",") || [];
      const isRepoAuthorized = authorizedRepos.includes(repository) || authorizedRepos.includes("*");
      
      return isUserAuthorized && isRepoAuthorized;
    } catch (error) {
      this.safeLog("error", "Authorization check error:", error);
      return false;
    }
  }

  /**
   * Generates a scoped GitHub App installation token
   */
  private async generateScopedToken(repository: string, organization?: string): Promise<string | null> {
    try {
      // Use the GitHub service to generate tokens
      if (!this.gitHubInitialized || !gitHubService.isReady()) {
        this.safeLog("warn", "GitHub App not available, returning mock token");
        return "ghs_mock_token_for_development_" + Math.random().toString(36).substring(2);
      }

      // Generate installation token using the GitHub service
      const token = await gitHubService.generateInstallationToken(
        repository, 
        organization,
        {
          contents: "read",
          metadata: "read",
          pull_requests: "read"
        }
      );

      return token;

    } catch (error) {
      this.safeLog("error", "Error generating scoped token:", error);
      return null;
    }
  }

}

export const credentialService = new CredentialService();
