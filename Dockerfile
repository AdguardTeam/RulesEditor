FROM adguard/node-ssh:22.22--0 AS base
SHELL ["/bin/bash", "-lc"]

RUN npm install -g pnpm@10.7.1

WORKDIR /rules-editor

ENV npm_config_store_dir=/pnpm-store

# ============================================================================
# Stage: deps
# Cached until package.json/pnpm-lock.yaml changes
# ============================================================================
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --ignore-scripts: package.json has "prepare": "husky install" which must not
# run in CI (requires a git repo and husky setup).
RUN --mount=type=cache,target=/pnpm-store,id=rules-editor-pnpm \
    pnpm install --frozen-lockfile --ignore-scripts

# ============================================================================
# Stage: source
# Full source copy — parent for all lint/test/build stages
# ============================================================================
FROM deps AS source

COPY . /rules-editor

# ============================================================================
# Stage: lint
# Runs ESLint
# ============================================================================
FROM source AS lint

ARG BUILD_RUN_ID=""

RUN --mount=type=cache,target=/pnpm-store,id=rules-editor-pnpm \
    echo "${BUILD_RUN_ID}" > /tmp/.build-run-id && \
    mkdir -p /out && \
    touch /out/lint.txt && \
    pnpm lint

FROM scratch AS lint-output
COPY --from=lint /out/ /

# ============================================================================
# Stage: test
# Runs Jest tests
# Always exits 0 — exit code stored in /out/exit-code.txt for Bamboo to check
# ============================================================================
FROM source AS test

ARG BUILD_RUN_ID=""

RUN --mount=type=cache,target=/pnpm-store,id=rules-editor-pnpm \
    echo "${BUILD_RUN_ID}" > /tmp/.build-run-id && \
    mkdir -p /out && \
    pnpm test; echo $? > /out/exit-code.txt

FROM scratch AS test-output
COPY --from=test /out/ /

# ============================================================================
# Stage: build
# Creates library build and packs .tgz for npm publish
# ============================================================================
FROM source AS build

ARG BUILD_RUN_ID=""

RUN --mount=type=cache,target=/pnpm-store,id=rules-editor-pnpm \
    echo "${BUILD_RUN_ID}" > /tmp/.build-run-id && \
    pnpm build && \
    pnpm pack --out rules-editor.tgz && \
    mkdir -p /out/artifacts && \
    mv rules-editor.tgz /out/artifacts/

FROM scratch AS build-output
COPY --from=build /out/ /
