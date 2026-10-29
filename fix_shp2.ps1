$path = "D:\MadaRisk\backend\src\services\event-bulletin-import\parsers\shapefile.ts"
$txt = Get-Content $path -Raw
$pattern = '(?s)export function isShapefileZip\(filePath: string\): boolean \{\r?\n  return path\.extname\(filePath\)\.toLowerCase\(\) === \x27\.zip\x27;\r?\n\}\r?\n\r?\n(.+)$'
$match = [regex]::Match($txt, $pattern)
if ($match.Success) {
  $rest = $match.Groups[1].Value.Trim()
  if ($rest -match 'return path\.extname') {
    $txt2 = $txt -replace $pattern, "export function isShapefileZip(filePath: string): boolean {\r\n  return path.extname(filePath).toLowerCase() === '.zip';\r\n}\r\n"
    Set-Content -Path $path -Value $txt2 -NoNewline
  }
}
