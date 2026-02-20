# v0.8.2

# Base node image
FROM node:20-alpine AS node

# Install jemalloc and git (for submodule init)
RUN apk add --no-cache jemalloc git
RUN apk add --no-cache python3 py3-pip uv

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/
RUN uv --version

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node . .

# Ensure agents submodule is populated (Railway excludes .git, submodule update fails)
ARG AGENTS_REPO=https://github.com/azevedojoel/agents
RUN if [ ! -f packages/agents/package.json ]; then \
    rm -rf packages/agents && mkdir -p packages && \
    git clone --depth 1 ${AGENTS_REPO} packages/agents; \
  fi

RUN \
    touch .env ; \
    mkdir -p /app/client/public/images /app/logs /app/uploads ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    npm ci --no-audit

# Railway excludes .git from build context - clone MCP submodules directly
ARG GOOGLE_WORKSPACE_REPO=https://github.com/azevedojoel/workspace.git
RUN rm -rf mcp-servers/google-workspace && \
    mkdir -p mcp-servers && \
    git clone --depth 1 ${GOOGLE_WORKSPACE_REPO} mcp-servers/google-workspace
RUN cd mcp-servers/google-workspace && npm install && npm run build

ARG MS365_MCP_REPO=https://github.com/azevedojoel/ms-365-mcp-server
RUN rm -rf mcp-servers/ms-365-mcp-server && \
    git clone --depth 1 ${MS365_MCP_REPO} mcp-servers/ms-365-mcp-server
RUN cd mcp-servers/ms-365-mcp-server && npm install && npm run generate && npm run build

RUN cd packages/agents && npm install && npm run build

RUN \
    # React client build with configurable memory
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend; \
    npm prune --production; \
    npm cache clean --force

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["npm", "run", "backend"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
