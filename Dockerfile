# Voidcrafters Medusa backend — production image
FROM node:22-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Yarn berry (starter pins yarn 4.12.0 via .yarnrc.yml)
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN corepack enable \
  && yarn install --immutable

COPY . .
RUN yarn build

EXPOSE 9000

# Migrate on every boot (idempotent), create the first admin only when
# ADMIN_EMAIL/ADMIN_PASSWORD are set and the user doesn't exist yet,
# then serve the API on :9000
CMD ["sh", "-c", "yarn medusa db:migrate && if [ -n \"$ADMIN_EMAIL\" ]; then yarn medusa user -e \"$ADMIN_EMAIL\" -p \"$ADMIN_PASSWORD\" || true; fi && yarn start"]
