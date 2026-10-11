import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  CreateProductWorkflowInputDTO,
  UpdateProductWorkflowInputDTO,
} from "@medusajs/framework/types"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { ODOO_MODULE } from "../modules/odoo"
import OdooModuleService from "../modules/odoo/service"

type Input = {
  offset: number
  limit: number
}

const getProductsFromErp = createStep(
  "get-products-from-erp",
  async (input: Input, { container }) => {
    const odooModuleService: OdooModuleService =
      container.resolve(ODOO_MODULE)

    const products = await odooModuleService.listProducts(undefined, input)

    return new StepResponse(products)
  }
)

export const syncFromErpWorkflow = createWorkflow(
  "sync-from-erp",
  (input: Input) => {
    const odooProducts = getProductsFromErp(input)

    // @ts-ignore
    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_sales_channel_id"],
    })

    // @ts-ignore
    const { data: shippingProfiles } = useQueryGraphStep({
      entity: "shipping_profile",
      fields: ["id"],
      pagination: { take: 1 },
    }).config({ name: "shipping-profile" })

    const externalIdsFilters = transform({ odooProducts }, (data) => {
      return data.odooProducts.map((product) => `${product.id}`)
    })

    // @ts-ignore
    const { data: existingProducts } = useQueryGraphStep({
      entity: "product",
      fields: ["id", "external_id", "variants.*"],
      filters: {
        // @ts-ignore
        external_id: externalIdsFilters,
      },
    }).config({ name: "existing-products" })

    const { productsToCreate, productsToUpdate } = transform(
      {
        existingProducts,
        odooProducts,
        shippingProfiles,
        stores,
      },
      (data) => {
        const productsToCreate: CreateProductWorkflowInputDTO[] = []
        const productsToUpdate: UpdateProductWorkflowInputDTO[] = []

        data.odooProducts.forEach((odooProduct) => {
          const optionInputs: { title: string; values: string[] }[] =
            odooProduct.attribute_line_ids.length
              ? odooProduct.attribute_line_ids.map((attribute) => ({
                  title: attribute.attribute_id.display_name,
                  values: attribute.value_ids.map((v) => v.display_name),
                }))
              : [{ title: "Default", values: ["Default"] }]

          const product:
            | CreateProductWorkflowInputDTO
            | UpdateProductWorkflowInputDTO = {
            external_id: `${odooProduct.id}`,
            title: odooProduct.display_name,
            description:
              (typeof odooProduct.description === "string" &&
                odooProduct.description) ||
              (typeof odooProduct.description_sale === "string" &&
                odooProduct.description_sale) ||
              "",
            status: odooProduct.is_published ? "published" : "draft",
            options: optionInputs,
            hs_code: (typeof odooProduct.hs_code === "string" && odooProduct.hs_code) || "",
            variants: [],
            shipping_profile_id: data.shippingProfiles[0].id,
            sales_channels: [
              { id: data.stores[0].default_sales_channel_id || "" },
            ],
          }

          const existingProduct = data.existingProducts.find(
            (p) => p.external_id === product.external_id
          )
          if (existingProduct) {
            product.id = existingProduct.id
          }

          const fallbackOptions = (): Record<string, string> => {
            const options: Record<string, string> = {}
            optionInputs.forEach((o) => {
              options[o.title] = o.values[0]
            })
            return options
          }

          const toVariantInput = (v: {
            id?: string
            title: string
            sku?: string
            options: Record<string, string>
            prices: { amount: number; currency_code: string }[]
            manage_inventory: boolean
            metadata: Record<string, string>
          }) => v as any

          if (odooProduct.product_variant_ids?.length) {
            product.variants = odooProduct.product_variant_ids.map(
              (variant) => {
                const valueEntries =
                  variant.product_template_variant_value_ids || []
                const options =
                  valueEntries.length > 0
                    ? Object.fromEntries(
                        valueEntries.map((v) => [
                          v.attribute_id.display_name,
                          v.name,
                        ])
                      )
                    : fallbackOptions()
                return toVariantInput({
                  id: existingProduct
                    ? existingProduct.variants.find(
                        (v) => v.sku === (variant.code || undefined)
                      )?.id
                    : undefined,
                  title: variant.display_name,
                  sku: (typeof variant.code === "string" && variant.code) || undefined,
                  options,
                  prices: [
                    {
                      amount: variant.list_price,
                      currency_code:
                        variant.currency_id.display_name.toLowerCase(),
                    },
                  ],
                  manage_inventory: false,
                  metadata: { external_id: `${variant.id}` },
                })
              }
            )
          } else {
            product.variants?.push(
              toVariantInput({
                id: existingProduct
                  ? existingProduct.variants[0].id
                  : undefined,
                title: "Default",
                options: { Default: "Default" },
                prices: [
                  {
                    amount: odooProduct.list_price,
                    currency_code:
                      odooProduct.currency_id.display_name.toLowerCase(),
                  },
                ],
                metadata: { external_id: `${odooProduct.id}` },
                manage_inventory: false,
              })
            )
          }

          if (existingProduct) {
            productsToUpdate.push(product as UpdateProductWorkflowInputDTO)
          } else {
            productsToCreate.push(product as CreateProductWorkflowInputDTO)
          }
        })

        return { productsToCreate, productsToUpdate }
      }
    )

    createProductsWorkflow.runAsStep({
      input: { products: productsToCreate },
    })

    updateProductsWorkflow.runAsStep({
      input: { products: productsToUpdate },
    })

    return new WorkflowResponse({ odooProducts })
  }
)
