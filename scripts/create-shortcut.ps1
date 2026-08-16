# Создаёт ярлык AgentForge Studio на рабочем столе.
#
# Запуск (из корня проекта):
#   powershell -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1
#
# Если проект уже собран в EXE (npm run dist) — ярлык будет вести на EXE.
# Иначе — прямо на electron.exe из node_modules (без чёрного окна консоли).

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'AgentForge Studio.lnk'

# 1) Собранный portable EXE, если он есть
$portable = Get-ChildItem -Path (Join-Path $projectRoot 'release') -Filter '*.exe' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($portable) {
    $target = $portable.FullName
    $arguments = ''
    $workDir = $portable.DirectoryName
    Write-Output "Режим: собранный EXE -> $target"
}
else {
    # 2) Запуск через electron.exe из node_modules
    $electron = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'
    if (-not (Test-Path $electron)) {
        Write-Error "Не найден $electron. Сначала выполните: npm install"
    }
    if (-not (Test-Path (Join-Path $projectRoot 'dist\main\main.js'))) {
        Write-Error 'Проект не собран. Сначала выполните: npm run build'
    }
    $target = $electron
    $arguments = '.'
    $workDir = $projectRoot
    Write-Output "Режим: electron.exe -> $target"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath = $target
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $workDir
$shortcut.IconLocation = "$target,0"
$shortcut.Description = 'AgentForge Studio — команда AI-агентов'
$shortcut.Save()

Write-Output "Готово: $linkPath"
