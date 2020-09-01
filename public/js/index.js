/* eslint-env browser */

function dropHandler(event) {
    console.log("File(s) dropped")

    // Prevent default behavior (Prevent file from being opened)
    event.preventDefault()

    if (event.dataTransfer.items) {
        // Use DataTransferItemList interface to access the file(s)
        for (let i = 0; i < event.dataTransfer.items.length; i++) {
            // If dropped items aren't files, reject them
            if (event.dataTransfer.items[i].kind === "file") {
                let file = event.dataTransfer.items[i].getAsFile()
                console.log("... file[" + i + "].name = " + file.name)
            }
        }
    } else {
        // Use DataTransfer interface to access the file(s)
        for (let i = 0; i < event.dataTransfer.files.length; i++) {
            console.log("... file[" + i + "].name = " + event.dataTransfer.files[i].name)
        }
    }
}
function dragOverHandler(ev) {
    console.log("File(s) in drop zone")

    // Prevent default behavior (Prevent file from being opened)
    ev.preventDefault()
}

function dragEnterHandler(ev) {
    ev.preventDefault()
    let content = document.getElementById("dndCardContent")
    let textNode = document.createElement("p")
    textNode.id = "dragIndicator"
    textNode.innerText = "Dragging..."
    content.appendChild(textNode)
}

function dragLeaveHandler(ev) {
    let dragIndicator = document.getElementById("dragIndicator")
    document.removeChild(dragIndicator)
}

function getTalenox() {
    var request = new XMLHttpRequest()
    request.open("GET", "/getTalenox", true)
    request.responseType = "json"
    request.onreadystatechange = function () {
        if (request.readyState != 4 || request.status != 200) return
        const statusText = document.getElementById("statusText")
        statusText.innerHTML = JSON.stringify(request.response)
    }
    request.send()
}

function formSubmitHandler(e) {
    e.preventDefault()
}

function runCommission() {
    getTalenox()
}

function statusOnMouseOver() {
    return
    let statusText = document.getElementById("statusText")
    statusText.style.visibility = "visible"
}

function statusOnMouseOut() {
    return
    let statusText = document.getElementById("statusText")
    statusText.style.visibility = "hidden"
}

function initDatePickers() {
    // Initialize datepicker
    document.addEventListener("DOMContentLoaded", function () {
        var elems = document.querySelectorAll(".datepicker")
        const today = new Date()
        const options = {
            format: "mmmm yyyy",
            defaultDate: new Date(today.getFullYear(), today.getMonth(), 1),
            setDefaultDate: true,
        }
        var instances = M.Datepicker.init(elems, options)
    })
}

function initSelects() {
    // Initialise select drop-downs
    document.addEventListener("DOMContentLoaded", function () {
        let elems = document.querySelectorAll("select")
        let options = {
            classes: "white-text",
            dropdownOptions: {
                hover: true,
            },
        }
        let instances = M.FormSelect.init(elems, options)
    })
}

async function getConfig() {
    return await (await fetch("/getConfig")).json()
}

async function setConfig(formID) {
    const params = {}
    const form = document.forms[formID]
    const url = new URL("/setConfig", window.location.origin)
    for (let element of form.elements) {
        if (element.nodeName === "INPUT" && element.value) {
            if (element.type === "checkbox") {
                Object.assign(params, { [element.name]: element.checked })
            } else {
                Object.assign(params, { [element.name]: element.value })
            }
        }
    }
    url.search = new URLSearchParams(params).toString()
    try {
        let response = await fetch(url)
        if (response.ok) {
            return
        } else {
            throw new Error(await response.text())
        }
    } catch (e) {
        console.log(e.message)
    }
}

function setMissingStaffFatal(config) {
    if (config.missingStaffAreFatal) {
        let element = document.getElementById("missingStaffFatal")
        element.checked = true
    }
}

function setUpdateTalenox(config) {
    if (config.updateTalenox) {
        let element = document.getElementById("updateTalenox")
        element.checked = true
    }
}

async function getPaymentWorkbook() {
    let response = await fetch("/getPaymentWorkbook")
    if (!response.ok) {
        await response.text().then((error) => {
            M.toast({ html: error })
        })
    }
}

async function initApp() {
    initDatePickers()
    initSelects()
    let config = await getConfig()
    setMissingStaffFatal(config)
    setUpdateTalenox(config)
}
