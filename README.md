# large-file-upload-demo

## 1. 项目背景 (Background)

在现代 Web 大文件上传场景中，开发者常面临协议选择的权衡：

- **HTTP/2 的局限性**：虽然通过“多路复用”实现了逻辑上的并发，但所有流（Stream）共享同一个物理 TCP 连接、同一个拥塞控制窗口（Congestion Window）和同一个顺序交付机制。在底层物理网络存在丢包或抖动时，单一 TCP 连接极易触发“队头阻塞（Head-of-Line Blocking）”，导致整个连接上的所有分片被阻塞，无法实现真正的物理并行。
- **协议的竞争本质**：TCP 协议的传输速率由其“拥塞控制窗口”决定。HTTP/2 在单一连接下，所有请求受限于单个窗口大小，难以充分榨干链路带宽。

## 2. 核心目标 (Objectives)

本项目旨在通过实测，量化验证以下两种上传策略的性能差异：

- **策略 A (HTTP/2 多路复用)**：单一域名，单一 TCP 连接，逻辑并发。
- **策略 B (域名分片 Domain Sharding)**：利用多个子域名，强制浏览器开启多个物理 TCP 连接，从而拥有多个独立的拥塞控制窗口，实现真正的“带宽抢占”与“物理并行”。

## 3. 实验设计 (Experimental Design)

本项目将搭建一套全栈环境进行性能对比：

- **监控指标**：传输总耗时、各 TCP 连接的吞吐量 (Mbps)、TCP 重传率 (Retransmission Rate)。
- **操作方式**：通过 `Nginx` 代理配置（或直接使用 Node.js HTTP/2 模块），在 HTTP/2 和 HTTP/1.1 协议间切换；通过修改本地 `hosts` 文件，灵活控制并发 TCP 连接的数量。

## 4. 快速开始 (Quick Start)

### 4.1 安装依赖

```bash
npm install
```

### 4.2 生成证书

确保已安装 `mkcert`（macOS 上可通过 `brew install mkcert` 安装）。

```bash
npm run cert
# 或者手动运行: ./setup-certs.sh
```

此命令将生成 `localhost-key.pem` 和 `localhost.pem`。

### 4.3 配置 Hosts

为了模拟多域名环境，请修改系统的 hosts 文件（`/etc/hosts`）：

```text
127.0.0.1 u1.local.com
127.0.0.1 u2.local.com
127.0.0.1 u3.local.com
127.0.0.1 u4.local.com
127.0.0.1 u5.local.com
127.0.0.1 u6.local.com
```

### 4.4 启动服务

**启动后端：**

```bash
npm start
```

服务器将运行在 **3000** 端口 (HTTPS/2)。
访问地址：

- `https://localhost:3000`
- `https://u1.local.com:3000`

**启动前端：**

```bash
# 请切换到前端目录并运行
npm run dev
```
