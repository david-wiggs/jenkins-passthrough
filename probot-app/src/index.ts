import { Probot } from "probot";
import { credentialService } from "./services/credential-service";
import { setupWebhooks } from "./webhooks";

export = (app: Probot) => {
  // Initialize the credential service
  credentialService.initialize(app);
  
  // Setup webhook handlers
  setupWebhooks(app);
  
  app.log.info("Jenkins Credential Service Probot app is ready!");
  app.log.info("Note: Use the separate Express server for API endpoints.");
};
