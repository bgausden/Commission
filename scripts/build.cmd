copy .\log4js.json .\src\
if %errorlevel% neq 0 exit /b %errorlevel%

call tsc --build --verbose
if %errorlevel% neq 0 exit /b %errorlevel%

copy .\src\staffHurdle.json .\dist\
if %errorlevel% neq 0 exit /b %errorlevel%

copy .\src\log4js.json .\dist\
if %errorlevel% neq 0 exit /b %errorlevel%

echo Build complete.