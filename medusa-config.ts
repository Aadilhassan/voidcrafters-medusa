import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

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
  }
})
