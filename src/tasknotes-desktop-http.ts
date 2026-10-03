import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import type { TaskNotesReadTransport } from "./tasknotes-read";

/** Desktop-only GET: no renderer Origin, redirects, retries, or shared connection pool. */
export const desktopTaskNotesRead: TaskNotesReadTransport = ({ url, headers, signal }) => {
  if (signal.aborted) return Promise.reject(Object.assign(new Error("TaskNotes 原文读取已取消"), { name: "AbortError", code: "ABORT_ERR" }));
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      reject(new Error("TaskNotes API 地址必须使用 HTTP/HTTPS"));
      return;
    }
    if (target.username || target.password) {
      reject(new Error("TaskNotes API 地址不能包含内嵌凭据"));
      return;
    }
    const request = target.protocol === "https:" ? httpsRequest : httpRequest;
    const pending = request(target, {
      method: "GET", headers: { ...headers, "Accept-Encoding": "identity" }, signal, agent: false,
    }, response => {
      response.once("error", reject);
      response.once("aborted", () => reject(new Error("TaskNotes 响应未完整结束")));
      const status = response.statusCode ?? 0;
      const statusText = response.statusMessage ?? "";
      // Refuse at headers, without following Location or waiting for a redirect body.
      if (status >= 300 && status < 400) {
        resolve({ status, statusText, text: "" });
        response.destroy();
        return;
      }
      const encoding = response.headers["content-encoding"];
      if (encoding && encoding.trim().toLowerCase() !== "identity") {
        reject(new Error("TaskNotes Content-Encoding 不受支持（只接受 identity）"));
        response.destroy();
        return;
      }
      // StringDecoder preserves multibyte UTF-8 characters split across chunks.
      response.setEncoding("utf8");
      let text = "";
      response.on("data", chunk => { text += chunk; });
      response.once("end", () => {
        if (!response.complete) { reject(new Error("TaskNotes 响应未完整结束")); return; }
        resolve({ status, statusText, text });
      });
    });
    pending.once("error", reject);
    pending.end();
  });
};
