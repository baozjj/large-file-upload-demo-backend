#!/bin/bash

# 检查 mkcert 是否已安装
if ! command -v mkcert &> /dev/null
then
    echo "错误: 未安装 mkcert。"
    echo "请先安装它（例如在 macOS 上使用 'brew install mkcert'）。"
    echo "然后运行 'mkcert -install' 安装本地 CA。"
    exit 1
fi

echo "正在生成 HTTP/2 服务器的 SSL 证书..."

# 为多个域名和 localhost 生成证书
# 我们将其命名为 server.js 预期的 localhost-key.pem 和 localhost.pem
mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1 u1.local.com u2.local.com u3.local.com

echo "-------------------------------------------------------"
echo "证书生成成功！"
echo "文件: localhost-key.pem, localhost.pem"
echo "现在可以使用以下命令启动服务器: node server.js"
echo "-------------------------------------------------------"
