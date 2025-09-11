import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import { config } from "dotenv";
import { Probot } from "probot";
import { credentialService, CredentialValidationRequest } from "./services/credential-service";

// Load environment variables from .env file
config();

// Initialize GitHub App in Express server for token generation
const initializeGitHubApp = () => {
  if (process.env.APP_ID && process.env.PRIVATE_KEY_PATH) {
    try {
      const probot = new Probot({
        appId: process.env.APP_ID,
        privateKey: require('fs').readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8'),
        secret: process.env.WEBHOOK_SECRET || 'development'
      });
      
      credentialService.initialize(probot);
      console.log("GitHub App initialized successfully for token generation");
      return true;
    } catch (error) {
      console.error("Failed to initialize GitHub App:", error);
      console.log("Falling back to standalone mode (mock tokens)");
      credentialService.initializeStandalone();
      return false;
    }
  } else {
    console.log("GitHub App configuration missing, using standalone mode (mock tokens)");
    credentialService.initializeStandalone();
    return false;
  }
};

const hasGitHubApp = initializeGitHubApp();

const app = express();
const PORT = process.env.PORT || 3000;
const PROBOT_PORT = process.env.PROBOT_PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  credentials: true
}));
app.use(bodyParser.json());

// Health check endpoint - enhanced for hybrid architecture
app.get("/health", (req: Request, res: Response) => {
  res.json({ 
    status: "healthy", 
    service: "jenkins-credential-service-api",
    architecture: "hybrid-with-probot",
    timestamp: new Date().toISOString(),
    ports: {
      api: PORT,
      probot: PROBOT_PORT
    }
  });
});

// Probot integration status check
app.get("/api/probot-status", async (req: Request, res: Response) => {
  try {
    const hasGitHubAppConfig = !!(process.env.APP_ID && process.env.PRIVATE_KEY_PATH);
    
    res.json({
      probot: {
        configured: hasGitHubAppConfig,
        port: PROBOT_PORT,
        webhookUrl: process.env.WEBHOOK_URL || "Not configured",
        appId: process.env.APP_ID || "Not configured"
      },
      api: {
        status: "running",
        port: PORT
      },
      integration: "hybrid-architecture",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking Probot status:", error);
    res.status(500).json({ 
      error: "Service check failed",
      probot: { status: "unknown" },
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
      initialized: hasGitHubApp,
      token_type: hasGitHubApp ? "real_github_tokens" : "mock_tokens",
      app_id: process.env.APP_ID || "not_configured"
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
