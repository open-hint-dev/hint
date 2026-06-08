### FUNCTION CONTRACT: applyCoupon

Implement the applyCoupon function according to the binding contract below. Every parameter, the return type, each error condition, and every step of the logic flow are mandatory — do not skip, reorder, rename, or approximate any of them.

#### Parameters

- **`cart: ShoppingCart`** — The active user shopping cart instance.
- **`code: string`** — The raw coupon identifier string to apply.

#### Returns

`ShoppingCart` — The updated cart entity with applied discount fields.

#### Errors

Throw these exact error types under the described conditions only. Do not substitute, wrap, or rename them. For every error listed here, emit at least one regression test that fails without the guard and passes with it — a declared error with no corresponding test is an incomplete implementation:

- **`ExpiredCouponError`** — Thrown if the current calendar date is past the coupon validity window.
- **`MinimumOrderValueException`** — Thrown if the cart total is lower than the coupon threshold.

#### Logic Flow

Implement the following logical sequence step-by-step without skipping any code validations:

1. Query our database to fetch metadata for the requested coupon `code`.
2. Check if the coupon is still active. If expired, halt and throw an ExpiredCouponError.
3. Sum the `priceInCents` multiplied by `quantity` for all items inside the ShoppingCart.
4. Compare total with coupon requirements. If insufficient, throw MinimumOrderValueException.
5. Apply the discount percentage to the total, mutate the cart's coupon state, and return the cart instance.
