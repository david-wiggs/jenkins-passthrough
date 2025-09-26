import { App } from "octokit";
import fs from "fs";

export interface GitHubAppConfig {
  appId: string;
  privateKeyPath: string;
  clientId?: string;
  clientSecret?: string;
}

class GitHubService {
  private app: App | null = null;
  private isInitialized = false;

  /**
   * Initialize GitHub App with Octokit
   */
  initialize(config: GitHubAppConfig): boolean {
    try {
      if (!config.appId || !config.privateKeyPath) {
        console.warn("GitHub App configuration missing");
        return false;
      }

      if (!fs.existsSync(config.privateKeyPath)) {
        console.error(`Private key file not found: ${config.privateKeyPath}`);
        return false;
      }

      const privateKey = fs.readFileSync(config.privateKeyPath, "utf8");

      this.app = new App({
        appId: config.appId,
        privateKey: privateKey,
        oauth: config.clientId && config.clientSecret ? {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        } : undefined,
      });

      this.isInitialized = true;
      console.log(`GitHub App initialized successfully (App ID: ${config.appId})`);
      return true;
    } catch (error) {
      console.error("Failed to initialize GitHub App:", error);
      return false;
    }
  }

  /**
   * Initialize from environment variables
   */
  initializeFromEnv(): boolean {
    return this.initialize({
      appId: process.env.APP_ID || "",
      privateKeyPath: process.env.PRIVATE_KEY_PATH || "",
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
    });
  }

  /**
   * Get installation ID for an organization
   */
  async getInstallationId(organization?: string, repository?: string): Promise<number | null> {
    if (!this.app || !this.isInitialized) {
      console.warn("GitHub App not initialized");
      return null;
    }

    try {
      if (organization) {
        // Get installation by organization
        const { data } = await this.app.octokit.rest.apps.getOrgInstallation({
          org: organization
        });
        return data.id;
      } else if (repository) {
        // If no organization, try to find installation by repository
        // This requires the repository to be in format "owner/repo"
        const [owner, repo] = repository.includes("/") ? repository.split("/") : ["", repository];
        if (owner && repo) {
          const { data } = await this.app.octokit.rest.apps.getRepoInstallation({
            owner,
            repo
          });
          return data.id;
        }
      }
      
      return null;
    } catch (error) {
      console.error("Error getting installation ID:", error);
      return null;
    }
  }

  /**
   * Generate a scoped installation access token
   */
  async generateInstallationToken(
    repository: string, 
    organization?: string,
    permissions?: Record<string, string>
  ): Promise<string | null> {
    if (!this.app || !this.isInitialized) {
      console.warn("GitHub App not initialized, returning mock token");
      return "ghs_mock_token_for_development_" + Math.random().toString(36).substring(2);
    }

    try {
      // Get the installation ID
      const installationId = await this.getInstallationId(organization, repository);
      
      if (!installationId) {
        console.error("No installation found for repository");
        return null;
      }

      // Create installation access token
      const { data: tokenData } = await this.app.octokit.rest.apps.createInstallationAccessToken({
        installation_id: installationId,
        repositories: [repository],
        permissions: permissions || {
          contents: "read",
          metadata: "read",
          pull_requests: "read"
        }
      });

      console.log(`Generated installation token for ${organization}/${repository}`);
      return tokenData.token;

    } catch (error) {
      console.error("Error generating installation token:", error);
      return null;
    }
  }

  /**
   * Get an authenticated Octokit instance for an installation
   */
  async getInstallationOctokit(organization?: string, repository?: string): Promise<any> {
    if (!this.app || !this.isInitialized) {
      throw new Error("GitHub App not initialized");
    }

    const installationId = await this.getInstallationId(organization, repository);
    if (!installationId) {
      throw new Error("No installation found");
    }

    return await this.app.getInstallationOctokit(installationId);
  }

  /**
   * Get teams that have access to a repository
   */
  async getRepositoryTeams(owner: string, repo: string): Promise<any[]> {
    try {
      if (!this.isReady()) {
        console.warn("GitHub App not initialized");
        return [];
      }

      const octokit = await this.getInstallationOctokit(owner, repo);
      
      // Get teams for the repository
      const response = await octokit.rest.repos.listTeams({
        owner,
        repo,
      });

      console.log(`Found ${response.data.length} teams for repository ${owner}/${repo}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching teams for repository ${owner}/${repo}:`, error);
      return [];
    }
  }

  /**
   * Check if GitHub App is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.app !== null;
  }
}

export const gitHubService = new GitHubService();