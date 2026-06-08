### FUNCTION CONTRACT: buildCartSummary

Implement the buildCartSummary function according to the binding contract below. Every parameter, the return type, each error condition, and every step of the logic flow are mandatory — do not skip, reorder, rename, or approximate any of them.

#### Parameters

- **`cart: ShoppingCart`** — The cart to summarize.

#### Returns

`CartSummary` — A read-only snapshot of the cart's current item count, subtotal, and applied coupon.

#### Logic Flow

Implement the following logical sequence step-by-step without skipping any code validations:

1. Count the total number of items across all cart entries.
2. Sum priceInCents multiplied by quantity for each item.
3. Check whether a couponCode is set and include its label if present.
4. Return a CartSummary record with itemCount, subtotalInCents, and couponLabel.
