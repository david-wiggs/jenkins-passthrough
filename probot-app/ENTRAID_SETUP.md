# EntraID Integration Configuration & Testing Guide

## Azure/EntraID App Registration Setup

### Step 1: Register Application in Azure Portal

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click "New registration"
3. Configure:
   - **Name**: `Jenkins Credential Service`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: Leave blank for now
4. Click "Register"

### Step 2: Configure API Permissions

1. In your app registration, go to "API permissions"
2. Click "Add a permission" → Microsoft Graph → Application permissions
3. Add these permissions:
   - `User.Read.All` - Read all user profiles
   - `Directory.Read.All` - Read directory data
   - `GroupMember.Read.All` - Read group memberships (optional)
4. Click "Grant admin consent" (requires admin privileges)

### Step 3: Create Client Secret

1. Go to "Certificates & secrets" → "Client secrets"
2. Click "New client secret"
3. Add description: `Jenkins Credential Service Secret`
4. Set expiration (recommend 12-24 months)
5. Copy the **secret value** immediately (it won't be shown again)

### Step 4: Get Configuration Values

From your app registration overview page, copy:
- **Application (client) ID**
- **Directory (tenant) ID**

## Configuration for Different Authentication Methods

### Method 1: Username/Password Validation (Resource Owner Password Credentials)

**⚠️ Warning**: This method requires special configuration and is generally discouraged for security reasons.

```bash
# .env configuration
AZURE_CLIENT_ID=your_client_id_here
AZURE_CLIENT_SECRET=your_client_secret_here  
AZURE_TENANT_ID=your_tenant_id_here
ENTRAID_AUTH_METHOD=ropc
```

### Method 2: User Lookup Only (Recommended for Production)

This method validates that the user exists in EntraID but doesn't validate passwords directly.

```bash
# .env configuration  
AZURE_CLIENT_ID=your_client_id_here
AZURE_CLIENT_SECRET=your_client_secret_here
AZURE_TENANT_ID=your_tenant_id_here
ENTRAID_AUTH_METHOD=lookup
```

### Method 3: Development/Testing Mode

For testing without EntraID integration:

```bash
# .env configuration
NODE_ENV=development
ENTRAID_AUTH_METHOD=mock
# Add test users (comma-separated)
TEST_VALID_USERS=user1@company.com,user2@company.com,admin@company.com
```

## Testing Scenarios

### 1. Mock Authentication (Development)
- Any username in `TEST_VALID_USERS` will pass authentication
- Any password will be accepted
- Good for initial testing

### 2. User Lookup Authentication  
- Validates user exists in EntraID
- Does not validate password (assumes external validation)
- Suitable when Jenkins already handles primary authentication

### 3. Full ROPC Authentication
- Validates both username and password against EntraID
- Requires special tenant configuration
- Most secure but complex setup

## Quick Test Setup

Use the development/mock mode for initial testing:

1. Copy `.env.example` to `.env`
2. Set `ENTRAID_AUTH_METHOD=mock`
3. Add test users to `TEST_VALID_USERS`
4. Start the service and test

## Next Steps

Which authentication method would you like to configure first? I can help you:

1. **Mock/Development setup** - Quick testing with fake users
2. **User lookup setup** - Validate users exist in EntraID  
3. **Full ROPC setup** - Complete username/password validation
4. **Custom integration** - Integrate with your existing auth system
