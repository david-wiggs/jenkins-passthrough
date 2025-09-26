// Simple test to verify MSAL configuration
const { PublicClientApplication } = require("@azure/msal-node");
const { config } = require("dotenv");

// Load environment variables
config();

async function testMsalConfig() {
    console.log("Testing MSAL Configuration...");
    
    // Check environment variables
    console.log("Environment Variables:");
    console.log("- AZURE_CLIENT_ID:", !!process.env.AZURE_CLIENT_ID);
    console.log("- AZURE_TENANT_ID:", !!process.env.AZURE_TENANT_ID);
    console.log("- AZURE_CLIENT_SECRET:", !!process.env.AZURE_CLIENT_SECRET);
    
    if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_TENANT_ID) {
        console.error("Missing required environment variables");
        return;
    }
    
    // Test Public Client configuration for ROPC
    const publicConfig = {
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        },
    };
    
    try {
        const publicClient = new PublicClientApplication(publicConfig);
        console.log("✅ PublicClientApplication created successfully");
        console.log("Authority:", publicConfig.auth.authority);
        console.log("Client ID:", publicConfig.auth.clientId);
        
        // Try to get accounts (should be empty for ROPC)
        const accounts = await publicClient.getAllAccounts();
        console.log("Accounts in cache:", accounts.length);
        
    } catch (error) {
        console.error("❌ Error creating PublicClientApplication:", error);
    }
}

testMsalConfig().catch(console.error);
