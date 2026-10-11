import { MedusaContainer } from "@medusajs/framework/types"
import { syncFromErpWorkflow } from "../workflows/sync-from-erp"
import { OdooProduct } from "../modules/odoo/service"

export default async function syncProductsJob(container: MedusaContainer) {
  // Dormant until the Odoo bridge is configured.
  if (!process.env.ODOO_URL) {
    return
  }

  const limit = 50
  let offset = 0
  let total = 0
  let odooProducts: OdooProduct[] = []

  console.log("Syncing products from Odoo...")

  do {
    odooProducts = (
      await syncFromErpWorkflow(container).run({
        input: { limit, offset },
      })
    ).result.odooProducts

    offset += limit
    total += odooProducts.length
  } while (odooProducts.length > 0)

  console.log(`Synced ${total} products from Odoo`)
}

export const config = {
  name: "daily-product-sync",
  // Every day at 02:00 server time
  schedule: "0 2 * * *",
}
