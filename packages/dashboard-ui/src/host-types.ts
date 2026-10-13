import type { WorkCaseViewModel } from "./work-case-model.js";
import type { CaseContentObservation } from "./case-content.js";
import type { NavigationModifiers } from "./task-navigation.js";

/** Display metadata only; adapters own real Core resolution and navigation. */
export interface CoreResolution {root:string;version:string;source:"fixed"|"claude-installed"|"codex-cache";notices:string[]}
export interface WorkCaseRenderState {casePath:string;caseContent?:CaseContentObservation|null;coreInfo?:CoreResolution|null;model:WorkCaseViewModel|null;loadedAt:string;staleReason:string;error:string;loading:boolean}
export interface DashboardAction {label:string;run:(event?:NavigationModifiers)=>Promise<void>|void}
export interface DashboardUiHost {
  renderMarkdown(text:string,element:HTMLElement,sourcePath:string):Promise<void>;
  viewReference?(reference:string):void;
  copyReference?(reference:string):Promise<void>;
}
