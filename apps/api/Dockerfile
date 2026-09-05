FROM node:22-alpine AS build
WORKDIR /app
COPY apps/api/package.json ./
RUN npm install
COPY apps/api ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

EXPOSE 4000
CMD ["node", "dist/index.js"]
