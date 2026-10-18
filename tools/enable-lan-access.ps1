param(
    [string]$LocalAddress = '172.20.10.2',
    [string]$RemoteSubnet = '172.20.10.0/28'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$report = Join-Path $projectRoot '_local\lan-firewall-status.json'
try {
    $address = Get-NetIPAddress -InterfaceAlias 'WLAN' -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -eq $LocalAddress }
    if (-not $address -or $address.PrefixLength -ne 28 -or $RemoteSubnet -ne '172.20.10.0/28') {
        throw 'Wi-Fi subnet has changed; review the rule before enabling access.'
    }
    $ruleName = 'Foodlenscare-LAN-5184'
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        throw 'Rule already exists; review its scope before changing it.'
    }
    New-NetFirewallRule -Name $ruleName -DisplayName 'Foodlenscare LAN 5184' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5184 `
        -LocalAddress $LocalAddress -RemoteAddress $RemoteSubnet -InterfaceAlias 'WLAN' `
        -Profile Any -Program 'D:\anconda\python.exe' `
        -Description 'Foodlenscare temporary backend: current Wi-Fi subnet only' | Out-Null
    @{ ok = $true; address = $LocalAddress; subnet = $RemoteSubnet; port = 5184 } |
        ConvertTo-Json | Set-Content -LiteralPath $report -Encoding utf8
} catch {
    @{ ok = $false; error = $_.Exception.Message } |
        ConvertTo-Json | Set-Content -LiteralPath $report -Encoding utf8
    exit 1
}
