# Jenkins Pipeline Credential Flow Diagram

```mermaid
sequenceDiagram
    participant J as Jenkins Pipeline<br/>(Branch Source Plugin)
    participant BL as Business Logic Service<br/>(GitHub App)
    participant E as EntraID
    participant GH as GitHub API

    Note over J: Pipeline triggered with<br/>username/password credentials

    J->>BL: Send credentials + repo info
    Note over J,BL: Username/password credential<br/>configured in Jenkins

    BL->>E: Validate credentials
    Note over BL,E: Authentication check

    alt Credentials Valid
        E-->>BL: ✓ Authentication successful
        
        BL->>BL: Check authorization<br/>for target repository
        Note over BL: Business logic determines<br/>if credentials allow repo access
        
        alt Authorized for Repository
            BL->>GH: Generate scoped installation token
            Note over BL,GH: GitHub App requests token<br/>scoped to accessible repositories
            
            GH-->>BL: Return installation token
            
            BL-->>J: ✓ Return GitHub App token
            Note over J: Token scoped only to<br/>authorized repositories
            
            J->>GH: Use token for repo operations
            Note over J,GH: Checkout, clone, etc.
            
        else Not Authorized
            BL-->>J: ✗ Access denied
            Note over J: Pipeline fails<br/>authorization check
        end
        
    else Credentials Invalid
        E-->>BL: ✗ Authentication failed
        BL-->>J: ✗ Invalid credentials
        Note over J: Pipeline fails<br/>authentication
    end
```

## Flow Description

1. **Jenkins Pipeline Start**: Pipeline configured with branch source plugin and username/password credentials
2. **Credential Submission**: Jenkins sends credentials along with repository information to the business logic service (GitHub App)
3. **Authentication**: Business logic service validates credentials against EntraID
4. **Authorization Check**: If authenticated, the service checks if credentials are authorized for the target repository
5. **Token Generation**: If authorized, the GitHub App component directly requests a scoped installation token from GitHub API
6. **Token Return**: GitHub API returns the scoped token to the business logic service, which forwards it to Jenkins
7. **Repository Access**: Jenkins uses the scoped token for repository operations
