# Test script for credential validation
# Replace the values below with real EntraID credentials

$testCredentials = @{
    username = "jenkins1@h3liosoutlook.onmicrosoft.com"  # Replace with real EntraID username
    password = "Ch33z3burg3r!"                 # Replace with real password
    repository = "bookstore"                   # Repository name to validate access for
    organization = "oodles-noodles"                  # Optional: GitHub organization
}

Write-Host "Testing credential validation with EntraID integration..." -ForegroundColor Yellow
Write-Host "Username: $($testCredentials.username)" -ForegroundColor Cyan

try {
    $body = $testCredentials | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/validate-credentials" -Method Post -Body $body -ContentType "application/json"
    
    Write-Host "✅ Validation successful!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3 | Write-Host
    
    if ($response.token) {
        Write-Host "🎯 Generated token length: $($response.token.Length) characters" -ForegroundColor Cyan
        Write-Host "🔐 Token scopes: $($response.scopes -join ', ')" -ForegroundColor Cyan
        Write-Host "⏰ Expires at: $($response.expiresAt)" -ForegroundColor Cyan
    }
}
catch {
    Write-Host "❌ Validation failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $errorStream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorStream)
        $errorBody = $reader.ReadToEnd()
        Write-Host "Server response: $errorBody" -ForegroundColor Red
    }
}

Write-Host "`nTo test with different credentials, edit this file and run it again." -ForegroundColor Yellow
