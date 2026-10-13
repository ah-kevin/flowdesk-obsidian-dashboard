import {readFile,writeFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const common=await readFile(new URL("packages/dashboard-ui/styles.css",root),"utf8");
const host=await readFile(new URL("styles.obsidian.css",root),"utf8");
await writeFile(new URL("styles.css",root),common+"\n"+host);
