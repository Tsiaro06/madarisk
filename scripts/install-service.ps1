#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installe (ou desinstalle) le backend MadaRisk comme tache planifiee Windows.

.DESCRIPTION
    Le probleme resolu : les jobs de synchronisation meteo vivent dans le
    processus Node du backend. Arret de `npm run dev` = pipeline arrete, et les
    observations vieillissent indefiniment (bandeau « 31 h », carte vide sur les
    indicateurs hors pluie).

    En registering le backend comme tache systeme demarrant au boot :
      - la synchronisation tourne 24 h/24, independamment de toute session ;
      - le processus redemarre automatiquement s'il tombe ;
      - le SPA compile est servi par l'API (port 5000), donc un seul processus
        est necessaire — plus besoin de garder Vite ouvert ;
      - `npm run dev` peut rester arrete sans consequence sur les donnees.

    En developpement, Vite (5173) peut tourner en parallele : il proxifie
    /api vers le port 5000, sans conflit.

.PARAMETER Action
    Install (defaut), Uninstall ou Status.

.PARAMETER SkipBuild
    Ne pas recompiler le backend ni le frontend.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1 -Action Status
#>
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Uninstall', 'Status')]
    [string]$Action = 'Install',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$TaskName = 'MadaRisk API'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'
$Launcher = Join-Path $PSScriptRoot 'run-production.cmd'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

function Get-Task {
    Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

if (-not (Test-Admin)) {
    throw "Ce script doit etre execute en administrateur. Relancez-le depuis une invite PowerShell 'Executer en tant qu'administrateur'."
}

switch ($Action) {
    'Status' {
        $task = Get-Task
        if (-not $task) {
            Write-Host "Service '$TaskName' : NON INSTALLE" -ForegroundColor Yellow
        } else {
            $info = Get-ScheduledTaskInfo -TaskName $TaskName
            Write-Host "Service '$TaskName' : INSTALLE" -ForegroundColor Green
            Write-Host ("  Etat          : " + $task.State)
            Write-Host ("  Derniere exec : " + $info.LastRunTime)
            Write-Host ("  Resultat      : " + $info.LastTaskResult)
        }
        try {
            $r = Invoke-RestMethod 'http://localhost:5000/health' -TimeoutSec 5
            Write-Host ("  API /health   : " + $r.data.status) -ForegroundColor Green
        } catch {
            Write-Host '  API /health   : injoignable' -ForegroundColor Yellow
        }
        break
    }

    'Uninstall' {
        if (Get-Task) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Host "Tache '$TaskName' supprimee." -ForegroundColor Green
        } else {
            Write-Host "Tache '$TaskName' absente." -ForegroundColor Yellow
        }
        break
    }

    'Install' {
        if (-not (Test-Path (Join-Path $BackendDir '.env'))) {
            throw "backend\.env introuvable. L'API ne peut pas demarrer sans lui (il est gitignore)."
        }

        if (-not $SkipBuild) {
            Write-Host 'Compilation du backend...' -ForegroundColor Cyan
            Push-Location $BackendDir
            try { npm run build } finally { Pop-Location }
            if ($LASTEXITCODE -ne 0) { throw 'Echec de la compilation du backend.' }

            Write-Host 'Compilation du frontend...' -ForegroundColor Cyan
            Push-Location $FrontendDir
            try { npm run build } finally { Pop-Location }
            if ($LASTEXITCODE -ne 0) { throw 'Echec de la compilation du frontend.' }
        }

        if (-not (Test-Path (Join-Path $FrontendDir 'dist\index.html'))) {
            throw 'frontend\dist\index.html introuvable : le SPA ne pourra pas etre servi.'
        }
        if (-not (Test-Path (Join-Path $BackendDir 'dist\server.js'))) {
            throw 'backend\dist\server.js introuvable : compilez le backend ou retirez -SkipBuild.'
        }

        if (Get-Task) {
            Write-Host "Mise a jour de la tache '$TaskName'..." -ForegroundColor Cyan
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }

        # `taskAction` et non `action` : PowerShell ignore la casse, donc `$action`
        # écrirait le paramètre `$Action` et casserait le `switch ($Action)`.
        $taskAction = New-ScheduledTaskAction -Execute 'cmd.exe' `
            -Argument "/c `"$Launcher`"" `
            -WorkingDirectory $BackendDir

        # Au demarrage du systeme + une relance periodique de secours, pour
        # rattraper un aller-retour rapide sur l'arret / le redemarrage.
        $triggerBoot = New-ScheduledTaskTrigger -AtStartup
        $triggerDaily = New-ScheduledTaskTrigger -Daily -At 6am

        $principal = New-ScheduledTaskPrincipal `
            -UserId 'SYSTEM' `
            -LogonType ServiceAccount `
            -RunLevel Highest

        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -RestartCount 999 `
            -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -MultipleInstances IgnoreNew

        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $taskAction `
            -Trigger @($triggerBoot, $triggerDaily) `
            -Principal $principal `
            -Settings $settings `
            -Description 'API MadaRisk + pipeline de synchronisation meteo. Indispensable pour que les donnees meteo restent fraiches hors session de dev.' | Out-Null

        Write-Host ''
        Write-Host "Tache '$TaskName' installee (demarrage automatique + redemarrage sur echec)." -ForegroundColor Green
        Write-Host ''
        Write-Host 'Demarrage immediat...' -ForegroundColor Cyan
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 6

        try {
            $r = Invoke-RestMethod 'http://localhost:5000/health' -TimeoutSec 10
            Write-Host ('API joignable sur http://localhost:5000 - ' + $r.data.status) -ForegroundColor Green
        } catch {
            Write-Host "L'API ne repond pas encore sur le port 5000. Verifiez : $BackendDir\logs\service.log" -ForegroundColor Yellow
        }

        Write-Host ''
        Write-Host 'Application   : http://localhost:5000' -ForegroundColor Green
        Write-Host 'Documentation  : http://localhost:5000/api/docs' -ForegroundColor Green
        Write-Host ''
        Write-Host 'Pour developper : laissez la tache tournee sur 5000 et lancez Vite sur 5173.' -ForegroundColor DarkGray
        Write-Host '  cd frontend ; npm run dev   -> http://localhost:5173' -ForegroundColor DarkGray
    }
}