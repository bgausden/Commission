if ! command -v tsc &> /dev/null
then
    if [ -f "./node_modules/.bin/tsc" ]; then
        TSC="./node_modules/.bin/tsc"
    else
        echo "tsc could not be found"
        exit 1
    fi
else
    TSC="tsc"
fi

cp ./log4js.json ./src/ && $TSC --build --verbose && cp ./src/staffHurdle.json ./src/log4js.json ./dist/ && echo "Build complete."