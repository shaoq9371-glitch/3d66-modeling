$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
    $service=Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
    if ($service.cad -eq 'ezdxf' -and $service.status -eq 'ok') {
        Start-Process 'http://127.0.0.1:8000'
        return
    }
} catch { }
$python=Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    $pythonCommand=Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) { throw '请先安装 Python 3.11 或更新版本。' }
    & $pythonCommand.Source -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 环境创建失败。' }
}
& $python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'CAD 服务依赖安装失败。' }
if (-not (Test-Path -LiteralPath 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw '网页依赖安装失败。' }
}
npm run build
if ($LASTEXITCODE -ne 0) { throw '网页构建失败。' }
Write-Host '3d66建模：http://127.0.0.1:8000。保持此窗口运行，按 Ctrl+C 停止。'
Start-Process 'http://127.0.0.1:8000'
& $python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
