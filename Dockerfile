# 网约车跑单规划助手 —— Docker 镜像（含飞牛 fnOS NAS 部署）
# 构建：docker build -t taxi-planner .
# 运行：docker run -d -p 3000:3000 --name taxi-planner \
#         -e QW_HOST=xxx -e QW_KEY=xxx -e AMAP_WS_KEY=xxx taxi-planner

FROM node:20-alpine

WORKDIR /app

# 复制前端静态文件 + 后端代理
COPY app/ ./app/
COPY server.js proxy-server.js ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
