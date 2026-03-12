const cluster = require('cluster');
const os = require('os');
const http2 = require('http2');
const express = require('express');
const http2Express = require('http2-express-bridge');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const Busboy = require('busboy');

// 如果是主进程，则 fork 工作进程
if (cluster.isPrimary) {
    const numCPUs = os.cpus().length;
    console.log(`主进程 ${process.pid} 正在运行`);
    console.log(`检测到 ${numCPUs} 个 CPU 核心，正在启动工作进程以支持高并发...`);

    // 为每个 CPU 核心启动一个工作进程
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // 监听工作进程退出事件，并自动重启
    cluster.on('exit', (worker, code, signal) => {
        console.log(`工作进程 ${worker.process.pid} 已退出 (信号: ${signal || code})，正在重启...`);
        cluster.fork();
    });

} else {
    // 工作进程逻辑：启动 HTTP/2 服务器

    const app = http2Express(express);

    // CORS 配置，允许来自任何源的请求（包括子域名）
    app.use(cors({
        origin: true, // 自动反射请求的 Origin，解决 credentials: true 时不能为 * 的问题
        methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: true
    }));

    // 确保上传和存储目录存在（多个进程共享同一个文件系统）
    const UPLOAD_DIR = path.join(__dirname, 'uploads');
    const STORAGE_DIR = path.join(__dirname, 'storage');
    // 尽量在主进程或者启动时一次性创建，但在这里为了保险起见保留
    fs.ensureDirSync(UPLOAD_DIR);
    fs.ensureDirSync(STORAGE_DIR);

    // 请求日志中间件
    app.use((req, res, next) => {
        console.log(`[Worker ${process.pid}] [${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.get('origin')}`);
        next();
    });

    // POST /upload - 处理文件分片上传
    app.post('/upload', (req, res) => {
        const busboy = Busboy({ headers: req.headers });
        let fileHash = '';
        let index = '';
        let saveTo = '';

        busboy.on('field', (fieldname, val) => {
            if (fieldname === 'fileHash') fileHash = val;
            if (fieldname === 'index') index = val;
        });

        busboy.on('file', (fieldname, file, info) => {
            // 重要：客户端必须在 FormData 中的文件 blob 之前附加 'fileHash' 和 'index'
            if (!fileHash || !index) {
                console.error(`[Worker ${process.pid}] 错误：文件流开始时缺少 fileHash 或 index。请确保 FormData 顺序正确。`);
                file.resume(); // 消费流以避免挂起
                return;
            }

            const chunkDir = path.join(UPLOAD_DIR, fileHash);
            // 注意：fs.ensureDirSync 在高并发下可能有竞争条件，但在 nodejs 中通常是原子性的或者报错忽略
            // 更好的做法是在上传前由客户端发起一个 init 请求创建目录，或者忽略 EEXIST 错误
            try {
                fs.ensureDirSync(chunkDir);
            } catch (e) {
                // 忽略目录已存在的错误
            }
            
            saveTo = path.join(chunkDir, index);
            console.log(`[Worker ${process.pid}] 接收到文件 ${fileHash} 的分片 ${index}`);
            
            const writeStream = fs.createWriteStream(saveTo);
            file.pipe(writeStream);
        });

        busboy.on('finish', () => {
            if (saveTo) {
                res.status(200).json({ message: '分片上传成功', worker: process.pid });
            } else {
                res.status(400).json({ error: '上传失败或缺少字段', worker: process.pid });
            }
        });

        busboy.on('error', (err) => {
            console.error(`[Worker ${process.pid}] 上传错误:`, err);
            res.status(500).json({ error: '上传失败' });
        });

        req.pipe(busboy);
    });

    // POST /merge - 合并分片为单个文件
    app.use(express.json()); 
    app.post('/merge', async (req, res) => {
        const { fileHash, filename } = req.body;
        
        if (!fileHash || !filename) {
            return res.status(400).json({ error: '缺少 fileHash 或 filename' });
        }

        const chunkDir = path.join(UPLOAD_DIR, fileHash);
        const filePath = path.join(STORAGE_DIR, filename);

        try {
            if (!fs.existsSync(chunkDir)) {
                return res.status(404).json({ error: '未找到分片' });
            }

            const chunks = await fs.readdir(chunkDir);
            // 按数字顺序对分片排序
            chunks.sort((a, b) => parseInt(a) - parseInt(b));

            // 确保存储目录存在
            await fs.ensureFile(filePath);
            // 清空文件以确保干净
            await fs.truncate(filePath, 0);

            // 顺序追加分片
            // 注意：合并操作是 I/O 密集型且需要顺序执行，单个文件的合并无法并行，但多个文件的合并可以由不同 Worker 处理
            for (const chunk of chunks) {
                const chunkPath = path.join(chunkDir, chunk);
                const data = await fs.readFile(chunkPath);
                await fs.appendFile(filePath, data);
                await fs.unlink(chunkPath); // 合并后删除分片
            }

            // 清理分片目录
            await fs.rmdir(chunkDir);

            res.status(200).json({ message: '文件合并成功', url: `/storage/${filename}`, worker: process.pid });
            console.log(`[Worker ${process.pid}] 文件已合并: ${filePath}`);

        } catch (err) {
            console.error(`[Worker ${process.pid}] 合并错误:`, err);
            res.status(500).json({ error: '合并失败' });
        }
    });

    app.get('/', (req, res) => {
        res.send(`HTTP/2 大文件上传后端正在运行 (Worker ${process.pid})`);
    });

    // 启动 HTTP/2 安全服务器
    const options = {
        key: fs.readFileSync(path.join(__dirname, 'localhost-key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'localhost.pem')),
        allowHTTP1: true // 允许不支持 HTTP/2 的客户端回退
    };

    const server = http2.createSecureServer(options, app);

    const PORT = 3000; 
    // Cluster 模式下，所有 Worker 可以监听同一个端口，Node.js 内部会进行负载均衡
    server.listen(PORT, () => {
        console.log(`[Worker ${process.pid}] HTTP/2 服务器监听于 https://localhost:${PORT}`);
    });
}
