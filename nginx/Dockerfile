# glibc (slim), not alpine/musl: the Vite/Rollup native bundler SIGBUSes under
# musl on arm64 during `vite build`. The runtime stage below still uses alpine.
FROM node:22-slim AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
