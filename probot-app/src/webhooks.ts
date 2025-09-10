import { Probot } from "probot";

export function setupWebhooks(app: Probot) {
  // Handle installation events
  app.on("installation.created", async (context) => {
    app.log.info(`GitHub App installed on organization: ${context.payload.installation.account?.login}`);
    
    // You can add logic here to:
    // - Store installation information
    // - Send notifications
    // - Initialize organization-specific settings
  });

  app.on("installation.deleted", async (context) => {
    app.log.info(`GitHub App uninstalled from organization: ${context.payload.installation.account?.login}`);
    
    // You can add logic here to:
    // - Clean up installation data
    // - Revoke stored tokens
    // - Send notifications
  });

  // Handle organization membership changes (useful for authorization)
  app.on("organization.member_added", async (context) => {
    const username = context.payload.membership?.user?.login;
    const orgName = context.payload.organization?.login;
    
    app.log.info(`User ${username} added to organization ${orgName}`);
    
    // You can add logic here to:
    // - Update user permissions
    // - Sync with authorization database
  });

  app.on("organization.member_removed", async (context) => {
    const username = context.payload.membership?.user?.login;
    const orgName = context.payload.organization?.login;
    
    app.log.info(`User ${username} removed from organization ${orgName}`);
    
    // You can add logic here to:
    // - Revoke user permissions
    // - Clean up user-specific data
  });

  app.log.info("GitHub webhook handlers configured successfully");
}
