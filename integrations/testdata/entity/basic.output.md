### DATA STRUCT: ShoppingCart

Implement the ShoppingCart data model with this exact schema. Do not alter field names, change types, add undeclared fields, or omit any field listed here. This is the authoritative blueprint for this structure throughout the codebase.

- id: string (uuidv4)
- userId: string | null (supports anonymous checkouts)
- items: Array<CartItem>
- couponCode: string | null
