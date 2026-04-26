NurAi Extension Icons
=====================

These PNGs are loaded by manifest.json. Chrome Web Store WILL REJECT the
upload, and the published listing page will show "Could not decode image:
'icon-128.png'", if any file is:

  - Not the EXACT pixel size declared in the manifest
  - Not a valid PNG
  - In an unusual color format Chrome's decoder dislikes
  - Larger than ~50 KB (oversized files trigger decoder issues even when valid)

REQUIRED state (do not regress):

  icon-16.png   16 x 16   PNG, 32bppArgb
  icon-19.png   19 x 19   PNG, 32bppArgb
  icon-38.png   38 x 38   PNG, 32bppArgb
  icon-128.png  128 x 128 PNG, 32bppArgb

If you replace any icon, you MUST regenerate at the EXACT pixel size and
save as PNG with RGBA (32bppArgb).

DO NOT drop a 2048x2048 or 2560x2560 source PNG here and assume the browser
will downscale. That is what previously broke the Chrome Web Store upload
("Could not decode image: 'icon-128.png'").

Quick PowerShell to verify after replacing:

  Add-Type -AssemblyName System.Drawing
  foreach ($n in 'icon-16.png','icon-19.png','icon-38.png','icon-128.png') {
    $img = [System.Drawing.Image]::FromFile("$PSScriptRoot\$n")
    "$n : $($img.Width)x$($img.Height) $($img.PixelFormat)"
    $img.Dispose()
  }
