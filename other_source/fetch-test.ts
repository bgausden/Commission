
const token = "a414c0ff493df6c17dc5f01af86c7907775ae057"

const headers = new Headers(
    {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
    }
)

const body = JSON.stringify({
    "payment": {
        "year": "2024",
        "month": "August",
        "period": "Whole Month",
        "with_pay_items": true,
        "pay_group": null
    }
})

const url = 'https://api.talenox.com/api/v2/payroll/payroll_payment'

const init:RequestInit = {
    headers: headers,
    body: body,
    redirect: 'follow' as const,
    method: 'POST' as const
}
const request = new Request(url, init)

const response = await fetch(url,init)
console.log(response.status, response.statusText)
const text = await response.text()
console.log(text)

/* console.log(response.status, response.statusText)
const text = await response.text()
console.log(text) */
console.log('done barry')

export {}

/* console.log('start postman')
const myHeaders = new Headers();
myHeaders.append("Accept", "application/json");
myHeaders.append("Content-Type", "application/json");
myHeaders.append("Authorization", "Bearer 0de2d0e87053fbffec39ba5377feee3010f73b8e");

const raw = JSON.stringify({
    "payment": {
        "year": "2024",
        "month": "August",
        "period": "Whole Month",
        "with_pay_items": true,
        "pay_group": null
    }
});

const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow"
};

fetch("https://api.talenox.com/api/v2/payroll/payroll_payment", requestOptions)
    .then((response) => response.text())
    .then((result) => console.log(result))
    .catch((error) => console.error(error));

console.log('done postman') */