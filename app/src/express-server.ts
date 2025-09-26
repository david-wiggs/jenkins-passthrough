import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import { config } from "dotenv";
import { credentialService, CredentialValidationRequest } from "./services/credential-service";

// Load environment variables from .env file
config();

// Initialize credential service (now includes GitHub App via Octokit)
credentialService.initialize();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  credentials: true
}));
app.use(bodyParser.json());

// Health check endpoint - simplified for single server architecture
app.get("/health", (req: Request, res: Response) => {
  res.json({ 
    status: "healthy", 
    service: "jenkins-credential-service-api",
    architecture: "octokit-only",
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Probot integration status check - now shows Octokit status
app.get("/api/probot-status", async (req: Request, res: Response) => {
  try {
    const hasGitHubAppConfig = !!(process.env.APP_ID && process.env.PRIVATE_KEY_PATH);
    
    res.json({
      github_app: {
        configured: hasGitHubAppConfig,
        using: "octokit",
        port: PORT,
        app_id: process.env.APP_ID || "Not configured"
      },
      api: {
        status: "running",
        port: PORT
      },
      integration: "octokit-only-architecture",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking GitHub App status:", error);
    res.status(500).json({ 
      error: "Service check failed",
      github_app: { status: "unknown" },
      api: { status: "running", port: PORT }
    });
  }
});

// Main credential validation endpoint for Jenkins
app.post("/api/validate-credentials", async (req: Request, res: Response) => {
  try {
    const { username, password, repository, organization } = req.body as CredentialValidationRequest;

    // Validate required fields
    if (!username || !password || !repository) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: username, password, repository"
      });
    }

    console.log(`Credential validation request for ${username}@${repository}`);

    // Validate credentials using the credential service
    const result = await credentialService.validateCredentials({
      username,
      password,
      repository,
      organization
    });

    if (result.success) {
      console.log(`Credential validation successful for ${username}@${repository}`);
      res.json({
        success: true,
        token: result.token,
        scopes: result.scopes,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
      });
    } else {
      console.warn(`Credential validation failed for ${username}@${repository}: ${result.error}`);
      res.status(401).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error("Error in credential validation endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// Endpoint to check service status and configuration
app.get("/api/status", (req: Request, res: Response) => {
  const hasAzureConfig = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);
  const hasGitHubConfig = !!(process.env.APP_ID && process.env.PRIVATE_KEY_PATH);

  res.json({
    service: "jenkins-credential-service",
    version: "1.0.0",
    configuration: {
      azure: hasAzureConfig ? "configured" : "missing",
      github: hasGitHubConfig ? "configured" : "missing"
    },
    github_app: {
      initialized: hasGitHubConfig,
      token_type: hasGitHubConfig ? "real_github_tokens" : "mock_tokens",
      app_id: process.env.APP_ID || "not_configured",
      using: "octokit"
    },
    debug: {
      azure_client_id: !!process.env.AZURE_CLIENT_ID,
      azure_client_secret: !!process.env.AZURE_CLIENT_SECRET,
      azure_tenant_id: !!process.env.AZURE_TENANT_ID,
      app_id: !!process.env.APP_ID,
      private_key_path: !!process.env.PRIVATE_KEY_PATH,
      env_keys: Object.keys(process.env).filter(key => key.includes('AZURE') || key.includes('APP') || key.includes('PRIVATE'))
    },
    timestamp: new Date().toISOString()
  });
});

// Endpoint for Jenkins to test connectivity
app.get("/api/ping", (req: Request, res: Response) => {
  res.json({ 
    pong: true, 
    timestamp: new Date().toISOString() 
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Jenkins Credential Service API listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Status: http://localhost:${PORT}/api/status`);
});

export default app;
