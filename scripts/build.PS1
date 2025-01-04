Copy-Item -Path .\log4js.json -Destination .\src\
if ($?) { tsc -p tsconfig.json }
if ($?) { Copy-Item -Path src\staffHurdle.json, src\log4js.json -Destination .\dist\ }