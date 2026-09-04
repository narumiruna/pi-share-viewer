FROM node:22.22-alpine3.23 AS builder

WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts vite.enhancer.config.ts ./
COPY session ./session
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.4-alpine3.24

USER root
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder --chown=101:101 /app/dist/ /usr/share/nginx/html/
COPY --chown=101:101 nginx.conf /etc/nginx/nginx.conf
USER 101:101

EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]
