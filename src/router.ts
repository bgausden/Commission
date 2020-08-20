import express, { Request, Response } from "express"
import multer from "multer"
import XLSX from "xlsx"


export const router = express.Router()

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './data')
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
})

const fileFilter = (req: Request, file: Express.Multer.File, cb: any): void => {
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

router.post('/uploadSpreadsheet', upload.single("file"), (req: Request, res: Response) => {
    try {
        res.status(200).send()
    } catch (e) {
        res.status(404).send(e.message)
    }
})