/**
 * The default configuration for the Log4JS logger.
 * 
 * This configuration defines several appenders for logging to files, stderr, and stdout,
 * as well as several categories for logging different types of messages at different levels.
 * 
 * @see https://log4js-node.github.io/log4js-node/index.html
 */
export const defaultLog4JSConfig = {
    "appenders": {
        "commission": {
            "type": "file",
            "filename": "commission.log",
            "layout": {
                "type": "messagePassThrough"
            },
            "flags": "w"
        },
        "contractor": {
            "type": "file",
            "filename": "contractor.log",
            "layout": {
                "type": "messagePassThrough"
            },
            "flags": "w"
        },
        "debug": {
            "type": "stderr"
        },
        "info": {
            "type": "stdout"
        },
        "warn": {
            "type": "stdout"
        },
        "error": {
            "type": "stderr"
        }
    },
    "categories": {
        "default": {
            "appenders": [
                "commission",
                "info"
            ],
            "level": "info"
        },
        "contractor": {
            "appenders": [
                "contractor",
                "info"
            ],
            "level": "info"
        },
        "debug": {
            "appenders": [
                "debug"
            ],
            "level": "info"
        },
        "info": {
            "appenders": [
                "info"
            ],
            "level": "info"
        },
        "warn": {
            "appenders": [
                "warn"
            ],
            "level": "warn"
        },
        "error": {
            "appenders": [
                "error"
            ],
            "level": "error"
        }
    }
}