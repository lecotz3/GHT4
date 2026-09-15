FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY v1/package*.json ./v1/
RUN npm ci --prefix v1 --include=dev
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORTA=3311 HOST=0.0.0.0 GHT4_SERVIR_INTERFACE=/app/v1/dist
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev && npm cache clean --force
COPY --from=build /app/v1/dist ./v1/dist
COPY server/src ./server/src
COPY packages ./packages
COPY data-quimicos.js ./data-quimicos.js
COPY ferramentas/administrar-acesso.mjs ./ferramentas/administrar-acesso.mjs
COPY ferramentas/entrada-segura.mjs ./ferramentas/entrada-segura.mjs
COPY ferramentas/preparar-banco.mjs ./ferramentas/preparar-banco.mjs
COPY ferramentas/iniciar-render.mjs ./ferramentas/iniciar-render.mjs
USER node
EXPOSE 3311
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.PORTA||3311)+'/api/saude').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server/src/index.mjs"]
