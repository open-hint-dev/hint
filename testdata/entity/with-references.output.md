### DATA STRUCT: OrderLine

Implement the OrderLine data model with this exact schema. Do not alter field names, change types, add undeclared fields, or omit any field listed here. This is the authoritative blueprint for this structure throughout the codebase.

- id: string (uuidv4)
- cart: ShoppingCart
- product: Product
- quantity: number (positive integer, min 1)
- priceInCents: number (snapshot at time of add)
