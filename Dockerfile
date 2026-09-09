FROM node:22-alpine

WORKDIR /app

# 1. 拷贝依赖清单并安装（只装生产依赖）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 2. 拷贝源码（含 packages 里的编辑器资源）
COPY packages/ packages/
COPY scripts/ scripts/
COPY eslint.config.js ./

# 3. 构建编辑器前端资源
RUN npm run build

# 4. 拷贝 NZIoT 定制（settings + 插件）
COPY nziot/ nziot/

# 5. 把插件安装到 userDir/node_modules（Node-RED 从这里发现插件）
RUN mkdir -p nziot/data/node_modules && \
    cp -r nziot/nziot-flow-runner nziot/data/node_modules/

# 6. 流程数据目录（持久化挂载点）
VOLUME /app/nziot/data

EXPOSE 1880

CMD ["node", "packages/node_modules/node-red/red.js", \
     "--settings", "nziot/settings.js", \
     "-u", "nziot/data"]
