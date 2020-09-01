/* eslint-env node */
import express, { Request, Response } from "express"
import multer, { FileFilterCallback } from "multer"
import XLSX from "xlsx"
import { getTalenoxEmployees } from "./talenox_functions.js"
import nodeConfigTS from "node-config-ts"
import { fstat, exists } from "fs"
const { config } = nodeConfigTS
import fs from "fs"
import path from "path"

export const router = express.Router()

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./data")
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    },
})

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
    const workBook = XLSX.readFile(`./data/${file.originalname}`, { sheetRows: 2 })
    if (workBook) {
        const firstCell = workBook.Sheets[workBook.SheetNames[0]]["A1"].v
        if (firstCell) {
            // Needs to match this format
            // Wednesday, 1 July 2020 – Friday, 31 July 2020
            const re = /^.*, [1-31]+ .* 2[0-9][0-9][0-9] – .*, [1-31]+ .* 2[0-9][0-9][0-9]$/
            if (re.test(firstCell)) {
                cb(null, true)
                return
            }
        }
    }
    cb(null, false)
    return
}

const upload = multer({ storage: storage, fileFilter: fileFilter })

router.post("/uploadSpreadsheet", upload.single("file"), (req: Request, res: Response) => {
    try {
        res.status(200).send()
    } catch (e) {
        res.status(404).send(e.message)
    }
})

router.get("/getTalenox", async (req: Request, res: Response) => {
    try {
        const staff = await getTalenoxEmployees()
        res.status(200).send(JSON.stringify(Array.from(staff.entries())))
    } catch (e) {
        res.status(404).send(e.message)
    }
})

router.get("/getConfig", (req: Request, res: Response) => {
    try {
        res.status(200).send(JSON.stringify(config))
    } catch (e) {
        res.status(404).send(e.message)
    }
})

router.get("/setConfig", (req: Request, res: Response) => {
    try {
        for (const key in req.query) {
            if (Object.prototype.hasOwnProperty.call(req.query, key)) {
                const element = req.query[key]
                if (key === "payrollDate") {
                    const substrings = (element as string).split(" ")
                    Object.assign(config, { PAYROLL_MONTH: substrings[0] })
                    Object.assign(config, { PAYROLL_YEAR: substrings[1] })
                } else {
                    if (Object.prototype.hasOwnProperty.call(config, key)) {
                        Object.assign(config, { key: element })
                    } else {
                        throw new Error(`Unrecognised config key: ${key}`)
                    }
                }
            }
        }
        res.status(200).send()
        console.log(config)
    } catch (e) {
        res.status(501).send(e.message)
    }
})

router.get('/getPaymentWorkbook', (req: Request, res: Response) => {
    const workbook = config.PAYMENTS_WB_NAME
    const workbookPath = path.join('data', workbook)
    if (fs.existsSync(workbookPath)) {
        res.status(200).sendfile(workbookPath)
    } else {
        res.status(404).send(`File ${workbookPath} does not exist or is unreadable.`)
    }
})

/* router.get('/',(req:Request, res: Response) => {
    try {
        res.status(200).send()
    }
}) */
