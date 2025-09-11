import { Probot } from "probot";
import { credentialService } from "./services/credential-service";
import { setupWebhooks } from "./webhooks";

export = (app: Probot) => {
  // Initialize the credential service
  credentialService.initialize(app);
  
  // Setup webhook handlers
  setupWebhooks(app);
  
  // Add a health check webhook
  app.webhooks.on("ping", async (context) => {
    app.log.info("Ping received - Probot app is healthy");
  });
  
  app.log.info("Jenkins Credential Service Probot app is ready!");
  app.log.info("Use the Express server (express-server.ts) for Jenkins API endpoints");
};
