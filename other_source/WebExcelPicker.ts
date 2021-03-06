/*
pass excel file name as parameter
read the excel file
find employee lines by locating line beginning with "Stylists"
foreach employee
    check for commission structure e.g hurdle
    calculate services commission
generate report
push into talenox
*/

// Button callback if we're doing things via a web page
async function onButtonClicked() {
    return await selectFile(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
}

/**
 * Select file(s). If we're doing things via a web page.
 * @param {String} contentType The content type of files you wish to select. For instance "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to select an Excel file.
 * @returns {Promise<File|File[]>} A promise of a file or array of files in case the multiple parameter is true.
 */
function selectFile(contentType: string) {
    return new Promise<File>(resolve => {
        let input = document.createElement("input");
        input.type = "file";
        input.accept = contentType;

        input.onchange = _ => {
            let files: File[];
            if (input.files !== null) {
                files = Array.from(input.files);
                resolve(files[0]);
            } else {
                resolve();
            }
        };
        input.click();
    });
}