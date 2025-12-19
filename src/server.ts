import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "./serverApp.js";

export const app = createApp();

const thisFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath !== "" && invokedPath === path.resolve(thisFilePath);

if (isMain) {
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
}
