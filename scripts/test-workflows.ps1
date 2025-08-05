# scripts/test-workflows.ps1
# Version: 1.0.0
# Description: PowerShell script to test GitHub Actions workflows locally using act
# Author: Ali Kahwaji

param(
    [string]$Workflow = "all",
    [switch]$DryRun = $false,
    [switch]$Verbose = $false
)

Write-Host "🧪 Testing GitHub Actions workflows locally with act" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Check if act is installed
if (-not (Get-Command "act" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ act is not installed. Please install it first:" -ForegroundColor Red
    Write-Host "   winget install nektos.act" -ForegroundColor Yellow
    Write-Host "   or visit: https://github.com/nektos/act" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
try {
    docker version | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green

# Test functions
function Test-Workflow {
    param(
        [string]$WorkflowFile,
        [string]$Event = "push",
        [string]$EventFile = ".github/act-events/push.json"
    )
    
    Write-Host "`n🔍 Testing workflow: $WorkflowFile" -ForegroundColor Yellow
    Write-Host "📅 Event: $Event" -ForegroundColor Gray
    
    $actArgs = @(
        "-W", ".github/workflows/$WorkflowFile"
        "--eventpath", $EventFile
    )
    
    if ($DryRun) {
        $actArgs += "--dry-run"
        Write-Host "🏃‍♂️ Dry run mode enabled" -ForegroundColor Blue
    }
    
    if ($Verbose) {
        $actArgs += "--verbose"
    }
    
    try {
        Write-Host "🚀 Running: act $($actArgs -join ' ')" -ForegroundColor Gray
        & act @actArgs
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Workflow test passed: $WorkflowFile" -ForegroundColor Green
        } else {
            Write-Host "❌ Workflow test failed: $WorkflowFile (exit code: $LASTEXITCODE)" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Error testing workflow: $WorkflowFile" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Main testing logic
switch ($Workflow.ToLower()) {
    "all" {
        Write-Host "🔄 Testing all consolidated workflows..." -ForegroundColor Cyan
        
        # Test roadmap maintenance
        Test-Workflow "roadmap-maintenance.yml" "workflow_dispatch" ".github/act-events/workflow_dispatch.json"
        
        # Test blog release
        Test-Workflow "blog-release.yml" "workflow_dispatch" ".github/act-events/workflow_dispatch.json"
        
        # Test main CI
        Test-Workflow "ci.yml" "push" ".github/act-events/push.json"
        
        # Test docs workflows
        Test-Workflow "docs-ci.yml" "push" ".github/act-events/push.json"
        Test-Workflow "docs-deploy.yml" "push" ".github/act-events/push.json"
    }
    "roadmap" {
        Test-Workflow "roadmap-maintenance.yml" "workflow_dispatch" ".github/act-events/workflow_dispatch.json"
    }
    "blog" {
        Test-Workflow "blog-release.yml" "workflow_dispatch" ".github/act-events/workflow_dispatch.json"
    }
    "ci" {
        Test-Workflow "ci.yml" "push" ".github/act-events/push.json"
    }
    "docs" {
        Test-Workflow "docs-ci.yml" "push" ".github/act-events/push.json"
        Test-Workflow "docs-deploy.yml" "push" ".github/act-events/push.json"
    }
    default {
        Test-Workflow "$Workflow" "push" ".github/act-events/push.json"
    }
}

Write-Host "`n📋 Workflow testing completed!" -ForegroundColor Cyan
Write-Host "💡 Tips:" -ForegroundColor Yellow
Write-Host "   - Use -DryRun to test without running actions" -ForegroundColor Gray
Write-Host "   - Use -Verbose for detailed output" -ForegroundColor Gray
Write-Host "   - Check .secrets file for required tokens" -ForegroundColor Gray
Write-Host "   - Ensure Docker is running for container-based actions" -ForegroundColor Gray
