import {pathToFileURL} from "node:url";
import {packageDashboardUi} from "./dashboard-ui-package.mjs";
export {packageDashboardUi};
if(import.meta.url===pathToFileURL(process.argv[1]).href)packageDashboardUi();
