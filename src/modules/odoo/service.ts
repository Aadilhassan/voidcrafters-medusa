import { JSONRPCClient } from "json-rpc-2.0"

type Options = {
  url?: string
  dbName?: string
  username?: string
  apiKey?: string
}

export type Pagination = {
  offset?: number
  limit?: number
}

export type OdooProduct = {
  id: number
  display_name: string
  is_published: boolean
  name: string
  list_price: number
  description: string | false
  description_sale: string | false
  product_variant_ids: OdooProductVariant[]
  hs_code: string | false
  image_1920: string | false
  attribute_line_ids: {
    attribute_id: { display_name: string }
    value_ids: { display_name: string }[]
  }[]
  currency_id: { id: number; display_name: string }
}

export type OdooProductVariant = Omit<
  OdooProduct,
  "product_variant_ids" | "attribute_line_ids"
> & {
  product_template_variant_value_ids: {
    id: number
    name: string
    attribute_id: { display_name: string }
  }[]
  code: string | false
}

const productSpecifications = {
  id: {},
  display_name: {},
  is_published: {},
  name: {},
  list_price: {},
  description: {},
  description_sale: {},
  hs_code: {},
  image_1920: {},
  currency_id: { fields: { display_name: {} } },
}

export default class OdooModuleService {
  private options: Options
  private client: JSONRPCClient
  private uid?: number

  constructor({}, options: Options) {
    this.options = options
    const url = options.url

    this.client = new JSONRPCClient((jsonRPCRequest) => {
      if (!url) {
        return Promise.reject(new Error("Odoo URL is not configured"))
      }
      return fetch(`${url}/jsonrpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(jsonRPCRequest),
      }).then((response) => {
        if (response.status === 200) {
          return response
            .json()
            .then((jsonRPCResponse) => this.client.receive(jsonRPCResponse))
        } else if (jsonRPCRequest.id !== undefined) {
          return Promise.reject(new Error(response.statusText))
        }
      })
    })
  }

  private assertConfigured() {
    const { url, dbName, username, apiKey } = this.options
    if (!url || !dbName || !username || !apiKey) {
      throw new Error(
        "Odoo module is not configured (ODOO_URL/ODOO_DB_NAME/ODOO_USERNAME/ODOO_API_KEY)"
      )
    }
  }

  async login() {
    this.assertConfigured()
    const { dbName, username, apiKey } = this.options
    this.uid = await this.client.request("call", {
      service: "common",
      method: "authenticate",
      args: [dbName, username, apiKey, {}],
    })
  }

  async listProducts(
    filters?: any,
    pagination?: Pagination
  ): Promise<OdooProduct[]> {
    if (!this.uid) {
      await this.login()
    }
    const { offset = 0, limit = 10 } = pagination || {}
    const { dbName, apiKey } = this.options

    const ids: number[] = await this.client.request("call", {
      service: "object",
      method: "execute_kw",
      args: [
        dbName,
        this.uid,
        apiKey,
        "product.template",
        "search",
        filters || [[["is_product_variant", "=", false]]],
        { offset, limit },
      ],
    })

    if (!ids.length) {
      return []
    }

    const products: OdooProduct[] = await this.client.request("call", {
      service: "object",
      method: "execute_kw",
      args: [
        dbName,
        this.uid,
        apiKey,
        "product.template",
        "web_read",
        [ids],
        {
          specification: {
            ...productSpecifications,
            product_variant_ids: {
              fields: {
                ...productSpecifications,
                product_template_variant_value_ids: {
                  fields: {
                    name: {},
                    attribute_id: { fields: { display_name: {} } },
                  },
                  context: { show_attribute: false },
                },
                code: {},
              },
            },
            attribute_line_ids: {
              fields: {
                attribute_id: { fields: { display_name: {} } },
                value_ids: {
                  fields: { display_name: {} },
                  context: { show_attribute: false },
                },
              },
            },
          },
        },
      ],
    })

    return products
  }
}
