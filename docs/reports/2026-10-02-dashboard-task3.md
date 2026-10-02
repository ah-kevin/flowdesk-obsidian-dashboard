# Dashboard Task 3：精确导航与恢复入口源码自检

仅执行当前 Task3 与 Globals，基线 Dashboard `1f649f1170ec14df2d5f28fe0c9502616c2dc0e3`、Core `3157475874240ecfc7a93f6272a9e7a728403c91`。工作目录与正式线程已核实，Core始终只读，保留主控原有Task3计划附录。首次交付为progress，独立review联合项保持未勾，未宣称整个Dashboard/FlowDesk重构完成。

精确Task来源已接所有实际consumer：records逐条按钮、diagnostics、完整API原文均先读准确TaskNotes GET，再以完整details在cachedRead文件中唯一匹配、来源片段/范围核对映射frontmatter偏移；当前editor.getValue再次核对。BOM/CRLF、重复heading、空details、旧内容/歧义/超界或身份/读取错误只开整张原文，不猜行。自身public file-open事件不会取消有意的跨Task导航，另一个选择/刷新/关闭仍取消旧响应。Case来源使用vault-file行空间并核对实际片段与编辑器。

关联列表和Task/Case正文共用source-navigation分流。wiki/vault与网页语义保留，文件URL、中文/空格/字面井号/编码引用正确处理；Task相对仓库引用只从真实API contexts、唯一Case路径的原生context标识和真实Case producer确认关联/cwd，不按标题、进程cwd或第一个Case猜。缺Case/目录/文件与歧义提供缺口/复制原引用，不创建错误vault笔记。正文拦截在异步MarkdownRenderer前安装capture，防止渲染未结束时落入错误的native relative-link行为。

恢复由同次真实Case snapshot的opt-in resume_bundle消费，原始source/tasks/resume_observation及每Task的goal/result/blocker/next、resume_sources、resume_missing、operation refs保留。没有补造bounds/generated_at/source_space；只标本地读取时间和原有timestamp。缺字段/歧义候选/UTF-8截断/omitted_count/partial/401均可见，refs写明仅引用。模型校验bundle Case来源、Task身份与status，不升级Task完成判定。

Core不投影Context/Summary全文，因此Case独立cachedRead保留完整正文及Goal/Current/Context/Summary物理来源，明确不能证明与snapshot同轮一致。即使snapshot失败，当前Case独立原文仍可读；所有响应仍受selection/controller/generation门禁。只有CLI精确以exit2拒绝--resume-bundle时允许一次默认schema1只读调用，明确显示恢复能力不可用；其他错误无该降级。

产品只提供恢复摘要/继续步骤/原nativeId-device历史指针的显式复制与原文导航；Task无Case时可复制准确Task引用给work，不强建Case。多个未完Task要求明确选择，换载体前保存回读并正常停止旧执行及已知后台工作；unknown只读或回原owner。macOS公开指定Obsidian argv仅为未执行的候选与准确路径/手工步骤，不启用未经UI验收的自动打开；其他平台不猜参数。未新增broker、controller、宿主桥或原生发送/queue/resume。

## 验证证据

- 最终 `npm test`：199 passed、0 failed、0 skipped，exit0（唯一owned runner）。
- `npm run typecheck`、`npm run build`、`npm run check:syntax`、`git diff --check`：exit0。仅本repo构建main.js，版本仍0.1.27。
- Task3 source-navigation 5项、真实Core writer transform→controlled HTTP→Case CLI→model/resume presentation 3项、Case全文1项、compiled实际View/导航/正文链接/摘要复制/错误与晚响应7项；另有opt-in真实CLI --help与legacy/independent-source回归。数字为node:test测试项，不把内部参数化scenario当独立测试量。
- 真实Task/Case两条producer、实际compiled plugin与consumer、owned文件和HTTP均运行。writer仅为ownedfixture生成真实canonical正文/状态，不是本Task真实记账工具，不调用未安装新MCP冒充记账。
- compiled查看/复制/刷新/导航HTTP只有GET与只读POST /api/tasks/query，业务PUT/PATCH/details append为0；Case原文件bytes不变。真实/usr/bin/open/Obsidian/codex/claude/queue仍拒绝，未增加native执行capability。
- Task1完整内容/普通Requirements/auth/alias/redaction与Task2状态、未知状态、500ms关联事件及same-case late response/error/finally回归保留；Task1/2 model/presentation golden不变。仅Task3独立导航panel class从原Task2 DOM class基线排除，其余仍exact-equal。
- 首个controlled HTTP RED保留sandbox listen EPERM；获准owned loopback后继续，guard未放宽。初次完整回归的6项旧fixture/静态断言失败已迁移：明确opt-in argv、恢复区块独立class、宽泛resume字串禁令收窄为真实副作用；没有删除有效旧行为测试。
- RED→GREEN覆盖来源映射/新opt-in、真实恢复消费、独立Case全文、编码路径、未保存editor变化、旧CLI明确能力拒绝、Case I/O失败、字面井号vault file URL及异步Markdown capture。最初fixture的Next含重复“下一步：”被真实Core保守判歧义，改成合法canonical输入，未改Core parser。

## 接线与证据边界

新增source-navigation/resume-presentation/case-content均有实际main/model/adapter/renderer消费者。精准行号只在完整API/文件/editor匹配后使用；恢复引用未包含可比原文时明确打开Task原文，不以有界引用行号冒充精准成功。普通HTTP错误/token别名/JSON逐项合并仍走原鉴权合同，Task contexts仅用于关联核对，不返回或改写status。

独立review尚未完成。已安装Obsidian、真实布局/键盘交互/精确定位、外部文件准确打开/tab影响/原位保存、导出/原生历史实际可用性与跨宿主执行接续均未验收；host/DOMdouble、CLI成功或App idle都不能替代这些层。没有stage/commit/push/install/release/bump，未维护parent/Case，不停止或接管任何宿主。

## 本轮裁定

- 只执行Task3，保留前两块与主控计划附录；独立review由主控统一安排，不另派Agent或新建聊天/worktree。
- 原文定位使用API details唯一匹配与public editor，无法验证即整张原文；没有producer源片段的有界恢复引用也不猜vault行。
- Task cwd只来自准确API contexts与唯一Case/native关联/cwd；缺口复制引用，代价是缺能力时需人工核对，避免错误checkout定位。
- Case全文是独立只读观测，snapshot失败仍保留内容而不构造健康Task集合；legacy仅精确拒绝opt-in flag的一次只读兼容调用。没有泛化错误fallback。
- native候选未启用，实际精准打开须后续UI证明；自动接管/宿主历史能力未知保持步骤与指针，不补桥。

## 管理回传

回传前按当前安装0.15.108 API-only例外保存本Task完整baseline、据证清单与E/V/D/Progress并回读，status维持in-progress，独立review联合项未勾。原生read_thread已核对指定userMessage `01a0f7a6-9058-78a0-b8f8-c3bc716c2106`，原问题包含向主控最小进度/完成/阻塞及主控返修，答“授权本次重构内双向协调”。此为已存在真人授权出处，不保证自动审批；具体拒绝则停本次发送，不重试/换通道，不重跑业务或改产品路线。

本次管理回读已确认：Task status=in-progress、schema4/task-centric/protocol4、health=healthy、source/current ID一致，E/V/D各1轮与完整baseline保留，独立review联合项未勾。最小Completion v2 progress已一次发送，App-native返回主控threadId且isError=false；仅证明发送受理，不代替主控读取或独立review。worker交付后保持idle，未提交/安装。

## 独立review返修批次（2026-10-02 14:23）

主控合并两组独立只读review为4项Important(P2)，无Critical/Minor。原审查导航16项与恢复37项有交叉，不能相加称53个不同测试；两组最初owned listen EPERM保留，限定loopback后通过，guard未放宽。首次199项GREEN未覆盖这些实际路由/clipboard缺口，本批不把旧测试通过当覆盖证明。

1. 普通vault Markdown路径被错误当repo：source-navigation增加公开MetadataCache实际vault解析能力，main在当前sourcePath调用getFirstLinkpathDest确认已有目标。普通目录/相对路径先保留native vault语义；不是靠Notes/Tasks/TaskNotes前缀推断存在。compiled回归已有Docs/资料.md、Clients/客户.md和../Docs/资料.md。
2. 文本级wiki href豁免污染同href Markdown链接及代码文本：移除wikiTargets全局集合。Markdown链接来源仅用于当前渲染锚点，与来源语法/可见label/同目标渲染occurrence核对，代码围栏/行内code/转义/注释不构成链接豁免，不能唯一核对则提示缺口。独立host double现在真实呈现wiki和Markdown两种锚点，覆盖同href、同label、围栏、行内code和转义。capture仍在异步MarkdownRenderer前安装；部分渲染歧义不猜。source helper有main消费者与纯来源回归，不修改Task事实或引入第三任务状态。
3. 恢复摘要漏Decisions：复制沿已有Case sections.decisions投影加入真实决策与vault-file来源；独立cachedRead的Decisions/决策也保留。Goal/Current/Context/Summary及独立读取关系不变，compiled实际clipboard包含“决策：保持只读。”及来源。
4. 继续工作复制仅通用句：改为当前真实观测的完整接续payload（Case/source、Task准确ID/原状态/已完成result/未完成Next、cwd/branch、缺字段/歧义/截断/来源/读取时间及独立Case正文）。保留明确选择准确Task、只读不自动全执行；compiled直接断言clipboard而非按钮或泛用安全句。

四个独立compiled回归RED为原有7 pass/4 fail，修复后11/11 GREEN。新逐链接来源的引用定义额外回归曾RED（定义误算为渲染链接），同批定点修后GREEN；没有改Core或放宽guard。

实际验证：`node tests/run-tests.mjs markdown-link-source.test.ts source-navigation.test.ts resume-presentation.test.ts case-content.test.ts dashboard-resume-integration.test.ts` 22 passed/0fail/0skip；公共main及host rendering fixture接线改变后本批只跑一次`npm test`全suite，205 passed/0fail/0skip。typecheck/build/check:syntax、git diff --check exit0。两种复制仍只有显式clipboard行为，受控HTTP仅GET/POST查询，无业务写入或native/queue/发送动作。Task1/2 golden及其他功能均保留。

本批只改这4项及直接链接来源helper/测试，源码仍未提交，Core干净只读，权限/协作默认不变；真实Obsidian/UI/外部Markdown打开与宿主接续仍未验收。Task保持in-progress，新增E/V/D/Progress后交主控复核，联合review清单不提前勾。

本批回传结果：当前Task E/V/D/Progress和完整baseline均已回读healthy/in-progress；唯一一次最小progress发送被auto-review拒绝，理由是可信用户内容未明确授权向该指定线程发送，代理或主控授权表述不能扩大用户授权。消息未发送，按合同停止本通道，不重试、不换通道、不改权限/协作默认。拒绝与Next已追加并回读本Task Progress；修复与复核资料均已持久保存，主控可直接只读回收，不重跑业务。

后续更新：当前聊天真人明确授权本次重构内后续向该主控回复，无需重复授权。已先写回并回读当前Task的授权/进度事实，再补发同request最小progress；App-native返回指定主控threadId、isError=false。只证明发送受理，主控复核仍待进行；Task保持in-progress，worker idle，权限与产品协作默认不变。

## 用户确认的联合升级边界（2026-10-02 14:31）

当前不安装/升级Obsidian或Dashboard、不替换已安装构建、不切运行版本，不再请求当前本地安装。真实UI/外部Markdown准确打开与安装后恢复接续在FlowDesk2.0联合发布和整体升级阶段验收，保持未验收，不记PASS；当前无法实装不阻塞已批准源码开发。未来联合发布安排不是现在commit/push/install/release/bump授权。

- **源码已接线、未实机验证**：Task记录/诊断/全文精准导航、已有vault链接与明确repo分流、恢复bundle/Case独立全文/决策及具体接续payload复制、generation/只读保护；本批4项P2修复及205项受控回归成立，真实Obsidian行为仍未验收。
- **源码尚未接执行适配器**：仓库外部Markdown“指定Obsidian自动打开”。目前resolveRelatedTarget/buildRepositoryOpenInvocation及main中的路径/候选/复制说明已接，但没有调用/usr/bin/open的产品执行适配器，也没有实际accepted/not_opened反馈链。原计划Step5等待公开路由UI确认再接线，本阶段尚未完成这部分源码；后续联合升级必须继续完成原目标，手工路径/步骤不是将自动目标改成功能缩水替代。
- **原Task不承诺自动宿主控制**：原生历史自动打开/跨宿主一键接管没有已验证公开能力，当前准确指针/上下文/步骤已接，不能据此宣称真实执行接续完成；其实际验收仍在联合升级阶段。

本时点调整仅更新计划/报告与本Task进展，不改产品功能、Core、权限或协作默认，不重跑未改的代码测试；Task仍in-progress待主控复核。

## 导航剩余两项P2边界返修（2026-10-02）

主控确认恢复两项Important已全部通过（独立25项）；导航基础18项通过但仍有两个剩余P2边界。两组文件有交叉，不相加称43个不同测试，初次owned listen EPERM仍保留。此次只修导航，不扩大已通过恢复复制，不改Core/权限/协作默认。

- vault subpath：公开类型明确getFirstLinkpathDest接收不含subpath的linkpath。现vaultLinkResolver先确认准确已有完整文件名以保留字面#，否则使用公开parseLinktext分离文件path与heading/block；存在性确认用path，实际openLinkText仍使用完整引用。compiled覆盖Clients/客户.md#概况、../Docs/资料.md#^block、原普通目录/相对路径、字面#文件名及编码file URL，检查送入metadata的查询不含heading/block。
- 实体标签：host double现在按真实DOM语义解码数字与常见HTML实体，先复现实际可见label“中文”被错误单匹配认成wiki的consumer RED。源码label解码后与DOM可见文本一致；DOM textContent不二次解码。实际浏览器仅针对实体使用标准DOM解码，不解析任意Task HTML；Node helper保留数值/常见实体fallback。混合wiki/Markdown同href不再由单个表面label匹配提前豁免，完整渲染按对应occurrence核对，部分渲染无法唯一核对则显式缺口；异步capture保留。

RED：compiled原11 pass/2 fail，分别失败在完整heading引用未导航、实际实体label错误wiki豁免；helper实体源码未解码独立RED。GREEN：`node tests/run-tests.mjs markdown-link-source.test.ts source-navigation.test.ts dashboard-resume-integration.test.ts` 21 passed/0failed/0skipped；完整与延迟渲染实体场景均触发正确repo处理或明确来源缺口，无native wiki误开。typecheck/build/check:syntax及git diff --check exit0。未无理由重跑全套205项，之前全suite证据不冒称本轮重新运行。

当前Task仍progress/in-progress待主控复核。当前不能安装、随2.0联合发布整体升级的边界不变；真实UI/外部Markdown准确打开与宿主接续未验收，自动外部打开执行适配器尚未接线继续单列，不把未实现伪装为未验收。无commit/push/install/release/bump。

## 外部Markdown打开源码接线（2026-10-02 14:55）

按主控补充的用户原目标“按支持外部md版本开发，后面整体升级默认支持”，安装/UI不是源码接线前置。本节覆盖14:31“执行适配器尚未接线”的当时状态；自动目标未缩水替换，源码开发不推迟到发布以后。原计划Step5及本Task对应时序/范围语句已定点校正，其他原范围/4项review/只读/身份/权限/协作默认保持。

依据：[官方1.14.2 changelog](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/)确认桌面vault外文件支持，系统Open with需新版installer；本轮只读`man open`确认-a指定应用。二者组合为待实机验证的公开路线，不证明准确原文件/保存。没有执行当前机器open/Obsidian，没有安装或替换构建。

src/repository-open.ts生产适配器现已实际接入plugin.openRepositoryMarkdown与main明确“在Obsidian打开文档”按钮。只由该明确点击执行，普通查看/导航/复制不启动；校验准确绝对.md文件、固定/Applications/Obsidian.app目录与Contents/MacOS/Obsidian文件，精确非shell argv无--args/-n/-F、10000ms超时、不自动重试。成功仅“打开请求已提交”；异常/超时结果未知，不能承诺文件未打开；不支持/不可用反馈原因，复制路径与步骤保留。busy阻止同次并发点击重复投递，新明确点击可重新申请。此文档投递不是Agent launch/create/send/queue或一键接管。

RED：生产adapter/compiled明确点击三项失败（unimplemented/缺按钮），之后GREEN。tests/repository-open用owned文件与app元数据、注入owned执行边界测试真正生产class；compiled点击同样调用生产class，记录精确/usr/bin/open + -a + 固定App + 原文件argv，执行边界一次调用、accepted消息、失败未知、busy、unsupported及路径保留。没有真实native许可；default runner /usr/bin/open/宿主拒绝不变。

最后必要闭包：`node tests/run-tests.mjs repository-open.test.ts markdown-link-source.test.ts source-navigation.test.ts dashboard-resume-integration.test.ts task-dashboard-baseline.test.ts dashboard-ui-contract.test.ts` 44 passed/0failed/0skipped；typecheck/build/check:syntax、git diff --check exit0，Core干净。未无理由重跑全部205，先前全suite不是本轮实测。Task1/2 golden不变，新明确文档按钮/反馈class单独归Task3增量。

最新状态区分：本Task文档打开生产适配器/点击/结果反馈源码已接线并受控验证，先前尚未接线缺口已补；真实Obsidian准确打开方/原文件/tab/原位保存仍未验收，随2.0联合发布整体升级验证。原生历史与跨宿主接管仍不在本Task自动控制承诺中，指针/具体步骤已实现，真实接续未验收。当前仍不commit/push/install/release/bump，Task progress/in-progress待独立review。

本批管理回读：当前Task完整baseline（除明确批准时序语句）保留，status=in-progress、schema4/task-centric/protocol4、health=healthy，E/V/D各3轮可见；最小progress一次发送受理（App-native返回指定主控threadId、isError=false）。仅发送受理，不代替独立review。worker保持idle，无安装/发布或实际native动作。

## 最后1项导航P2：确认身份传递（2026-10-02 15:46）

主控确认文档打开生产adapter/按钮链路独立18项及typecheck/syntax/diff无Critical/Important/Minor；导航另一路22项基础通过但仍遗漏字面#实际consumer身份传递，初次EPERM保留。本轮只修此导航P2，不改已通过恢复复制/adapter实现，不涉及主控讨论中的Core work/角色/入口事项。

resolver的vault目标现在保留resolvedPath与exactFile确认标记。正文Markdown的字面#目标不再仅因kind=vault放行native Markdown；精确确认的字面#路径由capture进入同一consumer，按resolvedPath重新取得并核对TFile后public openFile。相对关联../Docs/字面#文件.md也按已确认Docs/字面#文件.md打开，不用原相对串重新查找再让#变subpath。普通heading/block exactFile=false，保持完整引用openLinkText语义；已确认文件失效则缺口，不重解释#或创建笔记。

两个新增compiled实际入口RED：原14pass/2fail（正文未开、相对关联错误传原串）；GREEN后compiled16/16。必要source-navigation/markdown-link-source/dashboard-resume-integration闭包24 passed/0failed/0skip；typecheck/build/check:syntax、git diff --check exit0。覆盖既有heading/block/编码fileURL/字面#根路径、实际相对关联与正文链接、实体/异步capture。未无理由重跑全部205，adapter只是共享compiled文件中的保留回归，源码实现未重做。guard/真实native禁令保持；无业务Task写入、Core/权限/协作默认改动，无commit/push/install/release/bump。

Task仍progress/in-progress待主控复核。源码与未实机验证分开：外部文档生产打开适配器已接线并受控验证；真实UI/准确原文件/应用/tab/原位保存与安装后接续仍在2.0联合整体升级阶段验收，未运行不记PASS。

## 独立review最终通过与源码收口（2026-10-02 15:50）

主控确认最后字面# P2已独立通过：resolvedPath/exactFile贯穿正文/相对关联，重核TFile后public openFile，普通heading/block保留。无Critical/Important/Minor。独立owned runner初次8pass/16fail均listen EPERM，限定同一owned loopback重跑24 passed/0failed/0skip，guard未改。此前恢复25、文档adapter18独立复核也已通过，各组交叉，不相加冒称67个不同测试。

按主控仅作产品文案小修：仓库文档面板默认提示改为“点击后向Obsidian提交打开此原文件的请求”；保留准确路径、打开按钮、请求受理/未知、不支持反馈、复制与可操作手动步骤。开发/联合升级验收话术和纯调试argv JSON已从日常打开流程移除，main未使用的builder import删除，source-navigation builder仍供repository-open生产适配器使用。未改路由/adapter/权限/状态语义。

本次纯文案只运行typecheck/build/check:syntax、git diff --check，均exit0，不新增复述型测试、不重跑已通过全suite。独立review联合项已满足，将回勾并按当前Task API-only合同补E/V/D后收口，以schema4 healthy/trusted_done真实回读为准。真实UI、准确外部文件打开与保存、安装后恢复接续仍未验收，随2.0联合整体升级验证；不宣称整个FlowDesk2.0完成。

本Task源码目标已实现，外部文档adapter/实际点击/反馈已接线，不能再把旧“尚未接线”状态当当前事实。无commit/push/install/release/bump，不写parent/Case或Core，不实施主控正在讨论的A2–A5/激活入口。收口后保持idle。

最终管理回读：Task已done，schema4/task-centric/protocol4、source/current ID一致、health=healthy、completion.trusted_done=true、trust_level=tasknotes_only；原baseline除有据回勾保持，contexts/projects/tags未变，全部源码/独立review联合清单已勾。计时关闭，未查询或写计时。仅此Task源码与controlled交付完成；整个FlowDesk2.0与真实UI/安装后的打开保存/接续未完成。worker保持idle。

最小Completion v2 done已一次发送受理（App-native返回指定主控threadId，isError=false）；只证明发送受理，主控可据当前Task trusted_done真实回收。未新增任何权限或协作方向变更。
