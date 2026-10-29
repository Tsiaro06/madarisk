$path = "D:\MadaRisk\backend\src\services\event-bulletin-import\parsers\shapefile.ts"
$lines = Get-Content $path
$out = @()
$seen = $false
foreach ($l in $lines) {
  if ($l -match '^export function isShapefileZip') {
    if (-not $seen) {
      $out += $l
      $seen = $true
    }
    continue
  }
  $out += $l
}
$out | Set-Content $path
