# Role

你是一名全栈架构师。我们要开发 `large-file-upload-demo` 的后端，目标是**不使用 Nginx，直接使用 Node.js 构建 HTTPS/HTTP2 服务**。

# Requirements

1. **HTTPS 核心**：使用 Node.js 的 `http2` 模块结合 `express`，读取 `localhost.pem` 和 `localhost-key.pem` 启动一个 `createSecureServer`。
2. **多域名处理**：后端需能够同时响应来自 `u1.local.com` 和 `u2.local.com` 等域名的请求（在本地只需指向 127.0.0.1）。
3. **接口功能**：
   - `POST /upload`: 接收 `FormData` (fileHash, index, chunk)。将分片存入 `./uploads/{fileHash}/{index}`。
   - `POST /merge`: 合并分片并存入 `./storage/`。
4. **CORS 支持**：后端需通过 `cors` 中间件，设置 `Access-Control-Allow-Origin` 为 `*` (或动态 origin)，确保前端能够从不同子域名访问同一后端。

# Constraints

- 请提供生成本地证书的 shell 命令（使用 mkcert）。
- 请提供如何配置 `express` 路由，使其不关心来源域名，统一处理上传逻辑。
- 代码中需包含详细注释，说明如何利用 `http2.createSecureServer` 开启 HTTP/2 协议。
