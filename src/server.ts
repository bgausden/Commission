import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "./serverApp.js";

export const app = createApp();

const thisFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath !== "" && invokedPath === path.resolve(thisFilePath);

if (isMain) {
  const port = Number(process.env.PORT ?? "3000");
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
