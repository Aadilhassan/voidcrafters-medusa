import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST
const R2_CONFIGURED = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET &&
  process.env.R2_PUBLIC_URL
)
const GA_CONFIGURED = !!(
  process.env.GA_MEASUREMENT_ID && process.env.GA_API_SECRET
)

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    // TODO(https): drop this once admin+store are behind TLS.
    // Medusa forces Secure session cookies when NODE_ENV=production;
    // over plain HTTP browsers reject them and admin login loops forever.
    cookieOptions: {
      secure: false,
      sameSite: "lax" as const,
    },
  },
  plugins: [
    // Server-side GA4 ecommerce events (Measurement Protocol).
    // Dormant unless GA_MEASUREMENT_ID + GA_API_SECRET are set.
    ...(GA_CONFIGURED
      ? [
          {
            resolve: "@variablevic/google-analytics-medusa",
            options: {
              measurementId: process.env.GA_MEASUREMENT_ID,
              apiSecret: process.env.GA_API_SECRET,
              debug: false,
            },
          },
        ]
      : []),
    // Meilisearch product/category search (v1 line, Medusa 2.18).
    // Dormant unless MEILISEARCH_HOST is set.
    ...(MEILISEARCH_HOST
      ? [
          {
            resolve: "@rokmohar/medusa-plugin-meilisearch",
            options: {
              config: {
                host: MEILISEARCH_HOST,
                apiKey: process.env.MEILISEARCH_API_KEY ?? "",
              },
              settings: {
                products: {
                  type: "products",
                  enabled: true,
                  indexSettings: {
                    searchableAttributes: ["title", "description", "handle"],
                    displayedAttributes: [
                      "id",
                      "title",
                      "description",
                      "handle",
                      "thumbnail",
                    ],
                    filterableAttributes: ["id", "handle"],
                  },
                  primaryKey: "id",
                },
                categories: {
                  type: "categories",
                  enabled: true,
                  indexSettings: {
                    searchableAttributes: ["name", "description"],
                    displayedAttributes: ["id", "name", "description", "handle"],
                    filterableAttributes: ["id", "handle"],
                  },
                  primaryKey: "id",
                },
              },
            },
          },
        ]
      : []),
    // NOTE: @wanderwares/medusa-meta-commerce@0.1.0-beta.1 removed —
    // its MetaEventDelivery model declares created_at/updated_at explicitly,
    // which Medusa 2.18 forbids at build time. Re-evaluate on a stable release.
    // Meta Pixel (browser) can still be added to the storefront directly.
  ],
  modules: [
    // Anonymous journey tracking + intent tags + abandoned checkout.
    // Always on; storage is local Postgres, no keys required.
    {
      resolve: "./src/modules/tracking",
    },
    // Cloudflare R2 (S3-compatible) file storage. Falls back to Medusa's
    // built-in local file module when R2 vars are absent.
    ...(R2_CONFIGURED
      ? [
          {
            resolve: "@medusajs/file",
            options: {
              providers: [
                {
                  resolve: "@medusajs/file-s3",
                  id: "s3",
                  options: {
                    file_url: process.env.R2_PUBLIC_URL!,
                    access_key_id: process.env.R2_ACCESS_KEY_ID!,
                    secret_access_key: process.env.R2_SECRET_ACCESS_KEY!,
                    region: "auto",
                    bucket: process.env.R2_BUCKET!,
                    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
                  },
                },
              ],
            },
          },
        ]
      : []),
    // Odoo ERP bridge (products sync). Dormant unless ODOO_URL is set.
    {
      resolve: "./src/modules/odoo",
      options: {
        url: process.env.ODOO_URL,
        dbName: process.env.ODOO_DB_NAME,
        username: process.env.ODOO_USERNAME,
        apiKey: process.env.ODOO_API_KEY,
      },
    },
  ],
})
