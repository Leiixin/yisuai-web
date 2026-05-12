# Requires .NET — paint white over typical corner watermarks
Add-Type -AssemblyName System.Drawing
$path = Join-Path $PSScriptRoot "..\logo-yisuai-raw.png"
$out = Join-Path $PSScriptRoot "..\logo-yisuai.png"
$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $path))
$W = $bmp.Width
$H = $bmp.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$white = [System.Drawing.Brushes]::White
# Top-left (AI 水印区域)
$g.FillRectangle($white, 0, 0, [int]($W * 0.24), [int]($H * 0.14))
# Bottom-right (可灵 水印区域)
$g.FillRectangle($white, [int]($W * 0.68), [int]($H * 0.80), $W - [int]($W * 0.68), $H - [int]($H * 0.80))
$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "Wrote $out (${W}x${H})"
