Write-Host "Starting Docusaurus build test..." -ForegroundColor Green

# Set location to docs-site directory
Set-Location "c:\Users\alika\workspace\rag-pipeline-utils\docs-site"

# Check if node_modules exists
if (Test-Path "node_modules") {
    Write-Host "✅ node_modules found" -ForegroundColor Green
} else {
    Write-Host "❌ node_modules missing, running npm install..." -ForegroundColor Red
    npm install
}

# Check if package.json has build script
$packageJson = Get-Content "package.json" | ConvertFrom-Json
if ($packageJson.scripts.build) {
    Write-Host "✅ Build script found: $($packageJson.scripts.build)" -ForegroundColor Green
} else {
    Write-Host "❌ No build script found in package.json" -ForegroundColor Red
    exit 1
}

# Attempt to run the build
Write-Host "🔨 Running build..." -ForegroundColor Yellow
try {
    npm run build 2>&1 | Tee-Object -FilePath "build-output.log"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Build completed successfully!" -ForegroundColor Green
        
        # Check if build directory was created
        if (Test-Path "build") {
            $buildFiles = Get-ChildItem "build" -Recurse | Measure-Object
            Write-Host "📁 Build directory contains $($buildFiles.Count) files" -ForegroundColor Green
        }
    } else {
        Write-Host "❌ Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Check build-output.log for details" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Build process error: $($_.Exception.Message)" -ForegroundColor Red
}
