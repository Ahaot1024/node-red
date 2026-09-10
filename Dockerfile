FROM node:22-alpine

WORKDIR /app

# 1. 拷贝依赖清单
COPY package.json package-lock.json ./

# 2. 安装全部依赖（含 devDeps，构建需要）
RUN npm ci --no-audit --no-fund

# 3. 拷贝源码
COPY packages/ packages/
COPY scripts/ scripts/
COPY eslint.config.js ./

# 4. 构建编辑器前端资源
RUN npm run build

# 5. 删除 devDependencies，只留生产依赖（减小镜像体积）
RUN npm prune --omit=dev

# 6. 拷贝 NZIoT 定制（settings + 插件）
COPY nziot/ nziot/

# 7. 把插件安装到 userDir/node_modules（Node-RED 从这里发现插件）
RUN mkdir -p nziot/data/node_modules && \
    cp -r nziot/nziot-flow-runner nziot/data/node_modules/

# 8. 流程数据目录（持久化挂载点）
VOLUME /app/nziot/data

EXPOSE 1880

CMD ["node", "packages/node_modules/node-red/red.js", \
     "--settings", "nziot/settings.js", \
     "-u", "nziot/data"]
