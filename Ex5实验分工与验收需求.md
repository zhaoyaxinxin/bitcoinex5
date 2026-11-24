# Exercise 5（区块链版 Splitwise）双人实验分工与验收文件需求

## 1. 实验目标与整体架构

本实验要求使用 **Solidity** 与 **web3.js** 在以太坊本地测试网络（`ganache-cli`）上实现一个去中心化的借条（IOU）记账应用（DApp），核心包括：
1. **智能合约端（`mycontract.sol`）**：在链上存储借贷账本，提供查询接口 `lookup` 与新增借条接口 `add_IOU`，保证链上状态安全、防篡改且 Gas 消耗低。
2. **前端客户端（`script.js`）**：通过 `web3.js` 读取链上状态和历史交易，实现用户列表统计、总欠款查询、最近活跃时间查询，并在新增借条时利用广度优先搜索（BFS）检测并消除债务循环。

---

## 2. 开发前准备：共同约定接口（第 0 步）

两人开始编码前需先对齐以下前后端接口规范，避免联调返工：

1. **合约函数签名约定**
   * 查询欠款：`lookup(address debtor, address creditor) public view returns (uint32 ret)`
   * 添加借条：`add_IOU(address creditor, uint32 amount, address[] memory path) public`
2. **债务循环路径（`path`）参数约定**
   * **无循环**：客户端传入空数组 `[]`，合约直接累加 `debts[msg.sender][creditor] += amount`。
   * **存在循环**：客户端通过 `doBFS` 找到一条从 `creditor` 回到 `msg.sender` 的有向路径 `[creditor, ..., msg.sender]` 传入合约；合约校验该路径合法后，取整条闭环（含新边 `msg.sender -> creditor`）上的最小债务值 `minDebt`，将环路每条边的欠款同时减去 `minDebt`。
3. **地址大小写规范**
   * Remix 复制出的合约地址可能含校验和（混合大小写），而 `ganache-cli` 交易中的 `txn.to`、`txn.from` 为全小写。双方约定前端对比地址及填入 `contractAddress` 时统一使用 `.toLowerCase()`。
4. **函数命名注意**
   * 实验指导书 `Exercise5-2026.pdf` 中称客户端提交函数为 `send_IOU`，但入门代码 `script.js` 与 `index.html` 的按钮点击事件实际调用的是 `add_IOU(creditor, amount)`。**客户端中保持函数名为 `add_IOU`，切勿重命名。**

---

## 3. 两人实验分工明细

### 成员 A：智能合约开发、安全校验与合约测试

**核心职责**：负责链上逻辑设计与 `mycontract.sol` 实现，确保低 Gas 与防作弊安全性，并输出合约侧测试与文档材料。

1. **链上数据结构与合约编码（Remix）**
   * 设计精简存储结构：`mapping(address => mapping(address => uint32)) private debts;`。
   * 实现 `lookup(address debtor, address creditor)`。
   * 实现 `add_IOU(address creditor, uint32 amount, address[] memory path)`：
     * 前置检查：`require(amount > 0)`、`require(msg.sender != creditor)`。
     * 无环路径（`path.length == 0`）：直接累加欠款。
     * 有环路径（`path.length >= 2`）：
       * 校验 `path[0] == creditor` 且 `path[path.length - 1] == msg.sender`；
       * 遍历 `path` 校验相邻节点间确实存在正欠款（`debts[path[i]][path[i+1]] > 0`），并计算环路最小欠款 `minDebt`；
       * 对新增边与路径上的每条边扣除 `minDebt`（依赖 Solidity 0.8+ 溢出/下溢检查防止重复边作弊）。
2. **安全与 Gas 分析**
   * 验证恶意账户无法通过构造虚假 `path`、传入 `0` 或负数、重复同一条边等方式抹去自身债务。
   * 在 Remix 中分别记录“无环 `add_IOU`”与“3 节点消环 `add_IOU`”的 Gas 消耗，作为优化依据。
3. **Remix 单元测试与部署交接**
   * 在 Remix（连接本地 `ganache-cli` 或先在 Remix VM 验证）中切换不同 `Account` 完成单元测试。
   * 将最终代码完整复制到 `Ex5/mycontract.sol`，并整理好 ABI 与部署步骤交给成员 B。

---

### 成员 B：前端客户端开发、历史交易解析与全流程联调

**核心职责**：负责链下逻辑设计与 `script.js` 补全，完成 DApp 页面与本地节点的端到端联调测试。

1. **配置与辅助函数改造（`script.js`）**
   * 填入成员 A 提供的合约 `abi` 与部署后的 `contractAddress`（统一转为小写）。
   * 按 `script.js` 注释提示修改 `getAllFunctionCalls(addressOfContract, functionName)`：
     * 地址对比改为不区分大小写（`txn.to && txn.to.toLowerCase() === addressOfContract.toLowerCase()`）；
     * 在返回对象中补充区块时间戳字段 `timestamp: b.timestamp`，供 `getLastActive` 使用。
   * 新增图邻接点查询辅助函数 `getNeighbors(node)`：遍历所有用户，返回 `BlockchainSplitwise.lookup(node, u).toNumber() > 0` 的债权人列表。
2. **实现 4 个核心 TODO 函数（`script.js`）**
   * `getUsers()`：调用 `getAllFunctionCalls(contractAddress, 'add_IOU')`，收集所有 `from` 与 `args[0]`（统一小写去重）并返回地址数组。
   * `getTotalOwed(user)`：遍历 `getUsers()` 返回的用户列表，调用 `BlockchainSplitwise.lookup(user, u).toNumber()` 累加总额（注意 `BigNumber` 需调用 `.toNumber()`）。
   * `getLastActive(user)`：遍历 `add_IOU` 调用记录，匹配 `from` 或 `args[0]` 等于 `user` 的记录，返回最大的 `timestamp`（UNIX 秒级时间戳）；若无记录则返回 `null`。
   * `add_IOU(creditor, amount)`：解析正整数金额后，调用 `doBFS(creditor.toLowerCase(), web3.eth.defaultAccount.toLowerCase(), getNeighbors)` 查找环路，传入合约 `BlockchainSplitwise.add_IOU(creditor, amt, path, {from: web3.eth.defaultAccount, gas: 500000})`。
3. **前端联调与完整场景验证**
   * 启动 `ganache-cli`，在浏览器打开 `index.html` 与 F12 开发者控制台，确认无报错。
   * 完整测试所有交互与边界用例，并留存截图与测试记录。

---

## 4. 对应验收文件需求

### 4.1 成员 A 交付的验收文件

| 验收文件 | 放置位置/命名建议 | 验收内容与通过标准 |
| :--- | :--- | :--- |
| **合约源码文件** | `Ex5/mycontract.sol` | 1. 完整包含 `BlockchainSplitwise` 合约代码；<br>2. 在 Remix（Solidity 0.8.x）中编译零错误；<br>3. 实现 `lookup` 与 `add_IOU` 两个规定函数及必要 `require` 防作弊检查。 |
| **合约交接信息** | `Ex5/contract_info.txt`（内部交接用） | 1. 从 Remix Compile 标签页导出的完整 **ABI JSON**；<br>2. 编译器版本、部署说明及部署后的合约地址示例，确保成员 B 可直接粘贴到 `script.js` 使用。 |
| **合约测试与 Gas 记录** | `Ex5/contract_test_record.md`（附 Remix 截图） | 需包含以下 5 项测试截图及说明：<br>1. 普通 `add_IOU` 与 `lookup` 查询结果正确；<br>2. 同方向多次借款金额正确累加；<br>3. 两人互欠（A 欠 B 10，B 反向提交欠 A 10）后双方查询均为 0；<br>4. 三人循环测试（如 PDF 中的 `A->B:15, B->C:11, C->A:16` 消环后变为 `4, 0, 5`；以及 `15, 11, 9` 消环后变为 `6, 2, 0`）；<br>5. 异常拦截测试（`amount=0`、欠自己钱、伪造不存在的 `path` 均正确 `revert`）+ 交易 Gas 消耗数据。 |

---

### 4.2 成员 B 交付的验收文件

| 验收文件 | 放置位置/命名建议 | 验收内容与通过标准 |
| :--- | :--- | :--- |
| **前端核心脚本** | `Ex5/script.js` | 1. 已填入正确 `abi` 与当前部署的小写 `contractAddress`；<br>2. 完整实现 `getUsers`、`getTotalOwed`、`getLastActive`、`add_IOU` 及辅助函数；<br>3. 未破坏原有页面 DOM 事件与 UI 渲染逻辑；<br>4. 浏览器控制台无 JS 运行时错误。 |
| **端到端联调测试记录** | `Ex5/e2e_test_record.md`（附网页+控制台截图） | 需包含以下 5 项联调验证截图及说明：<br>1. 初始状态：切换任意未交易账户，`Total Owed` 显示 `$0`，`Last Activity` 显示 `unknown`；<br>2. 发起 IOU：选择账户 A 向 B 提交欠条后，`Users` 列表展示 A 与 B，`Total Owed` 与 `Last Activity` 实时更新为正确数值与本地时间；<br>3. 两人抵消还款：A 欠 B 10 元后，切换 B 向 A 提交 10 元，双方 `Total Owed` 均更新为 `$0`；<br>4. 多人消环：按 `A->B:15`、`B->C:11`、`C->A:16` 依次提交后，页面中 A、B、C 的 `Total Owed` 分别为 `$4`、`$0`、`$5`；<br>5. 刷新页面后链上数据仍可完整还原显示。 |

---

## 5. 多电脑协作交接与重新部署说明

本实验使用的 `ganache-cli` 仅在**运行它的那台电脑内存中**维护临时私有链（默认 `http://localhost:8545`），重启或换电脑后链上已部署的合约实例会失效，因此两人协作时需遵循以下交接方式：

1. **只共享代码即可保证一致性**：两人无需共用同一台电脑或连接同一个 `ganache-cli` 节点，只需通过 Git 共享源码（`mycontract.sol`、`script.js` 等）。
2. **换电脑或重启节点后必须重新部署**：
   * 成员 B 拉取成员 A 的 `mycontract.sol` 后，需在**自己电脑**启动 `ganache-cli`，在 Remix（`Custom - External Http Provider` -> `http://127.0.0.1:8545`）重新编译并部署合约；
   * 将**自己本次部署新生成的合约地址**（和最新 `abi`）填入自己本地的 `script.js` 中，再打开 `index.html` 进行联调。
   * 每次重启 `ganache-cli` 或成员 A 修改了 `mycontract.sol`，都需要重新部署一次并更新 `script.js` 中的 `contractAddress`（若提交到公共 Git 仓库，注意不要把仅自己本机有效的旧测试地址当成永久地址）。

---

## 6. 整组最终提交验收清单

在提交实验作业前，两人需共同完成以下最终合流检查：

- [ ] **环境一致性**：启动 `ganache-cli`，在 Remix 选择 `Custom - External Http Provider (http://127.0.0.1:8545)` 重新部署 `mycontract.sol`，确认将新的 `abi` 与 `contractAddress` 填入 `script.js` 后，整套 DApp 可直接跑通。
- [ ] **代码完整性**：`Ex5/mycontract.sol` 与 Remix 中最终部署的合约源码完全一致；`Ex5/script.js` 中无残留的 `FIXME` 或未完成的 `TODO`。
- [ ] **无关文件未被误改**：`index.html`、`style.css`、`utils.js`、`web3.min.js`、`abi-decoder.js` 保持原样可用。
- [ ] **报告与材料归档**（如课程要求提交报告）：汇总成员 A 的合约设计/安全/Gas 分析与成员 B 的前端实现/端到端测试截图，形成最终实验报告并随代码一并提交（提交前可移除仅用于内部交接的临时文件 `contract_info.txt`，或按课程目录要求整理）。
