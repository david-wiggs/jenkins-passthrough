import { Probot } from "probot";
import { ConfidentialClientApplication, PublicClientApplication, Configuration } from "@azure/msal-node";
import jwt from "jsonwebtoken";

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
}

class CredentialService {
  private app: Probot | null = null;
  private msalInstance: ConfidentialClientApplication | null = null;
  private publicMsalInstance: PublicClientApplication | null = null;

  initialize(app: Probot) {
    this.app = app;
    this.initializeMsal();
  }

  // Initialize for standalone mode (without Probot)
  initializeStandalone() {
    this.initializeMsal();
  }

  private safeLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
    if (this.app && this.app.log) {
      (this.app.log as any)[level](message, data);
    } else {
      // Fallback to console logging when Probot is not available
      const logMethod = level === 'debug' ? 'log' : level;
      console[logMethod as 'log' | 'info' | 'warn' | 'error'](`[${level.toUpperCase()}]`, message, data || '');
    }
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

      // Step 1: Authenticate with EntraID
      const isAuthenticated = await this.authenticateWithEntraID(request.username, request.password);
      
      if (!isAuthenticated) {
        return {
          success: false,
          error: "Authentication failed"
        };
      }

      // Step 2: Check authorization for the repository
      const isAuthorized = await this.checkRepositoryAuthorization(request.username, request.repository, request.organization);
      
      if (!isAuthorized) {
        return {
          success: false,
          error: "User not authorized for this repository"
        };
      }

      // Step 3: Generate scoped GitHub App token
      const token = await this.generateScopedToken(request.repository, request.organization);
      
      if (!token) {
        return {
          success: false,
          error: "Failed to generate GitHub token"
        };
      }

      return {
        success: true,
        token: token,
        scopes: ["contents:read", "metadata:read", "pull_requests:read"]
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
  private async authenticateWithEntraID(username: string, password: string): Promise<boolean> {
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
      return false;
    }
  }

  /**
   * Mock authentication for development/testing
   */
  private async mockAuthentication(username: string, password: string): Promise<boolean> {
    const validUsers = process.env.TEST_VALID_USERS?.split(",") || [];
    const isValidUser = validUsers.includes(username) || validUsers.includes("*");
    
    this.safeLog("info", `Mock authentication for ${username}: ${isValidUser ? "SUCCESS" : "FAILED"}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return isValidUser;
  }

  /**
   * User lookup authentication - validates user exists in EntraID
   */
  private async userLookupAuthentication(username: string): Promise<boolean> {
    if (!this.msalInstance) {
      this.safeLog("warn", "MSAL not configured, falling back to mock auth");
      return process.env.NODE_ENV === "development";
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
        return userExists;
      }

      return false;
    } catch (error) {
      this.safeLog("error", "User lookup authentication error:", error);
      return false;
    }
  }

  /**
   * Full Resource Owner Password Credentials authentication
   */
  private async fullROPCAuthentication(username: string, password: string): Promise<boolean> {
    if (!this.publicMsalInstance) {
      this.safeLog("warn", "MSAL Public Client not configured for ROPC");
      return false;
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
          return true;
        } else {
          this.safeLog("warn", `Token verification failed for user: ${username}`);
          return false;
        }
      } else {
        this.safeLog("warn", `ROPC authentication failed: No access token received for user: ${username}`);
        return false;
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
      
      return false;
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
      // When running in standalone mode, return a mock token for development
      if (!this.app) {
        this.safeLog("warn", "GitHub App not available in standalone mode, returning mock token");
        return "ghs_mock_token_for_development_" + Math.random().toString(36).substring(2);
      }

      // Get the installation ID for the repository/organization
      const installationId = await this.getInstallationId(repository, organization);
      
      if (!installationId) {
        this.safeLog("error", "No installation found for repository");
        return null;
      }

      // Create an authenticated Octokit instance for the installation
      const octokit = await this.app.auth(installationId);
      
      // Create a new installation access token
      const { data: tokenData } = await octokit.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
        repositories: [repository],
        permissions: {
          contents: "read",
          metadata: "read",
          pull_requests: "read"
        }
      });

      return tokenData.token;

    } catch (error) {
      this.safeLog("error", "Error generating scoped token:", error);
      return null;
    }
  }

  /**
   * Gets the installation ID for a given organization or repository
   */
  private async getInstallationId(organization?: string, repository?: string): Promise<number | null> {
    try {
      if (!this.app) {
        this.safeLog("warn", "GitHub App not available for installation lookup");
        return null;
      }

      const github = await this.app.auth();
      
      if (organization) {
        // Get installation by organization
        const { data } = await github.rest.apps.getOrgInstallation({
          org: organization
        });
        return data.id;
      } else if (repository) {
        // If no organization, try to find installation by repository
        // This requires the repository to be in format "owner/repo"
        const [owner, repo] = repository.includes("/") ? repository.split("/") : ["", repository];
        if (owner && repo) {
          const { data } = await github.rest.apps.getRepoInstallation({
            owner,
            repo
          });
          return data.id;
        }
      }
      
      return null;
    } catch (error) {
      this.safeLog("error", "Error getting installation ID:", error);
      return null;
    }
  }
}

export const credentialService = new CredentialService();
