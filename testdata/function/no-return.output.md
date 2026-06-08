### FUNCTION CONTRACT: logCheckoutEvent

Implement the logCheckoutEvent function according to the binding contract below. Every parameter, the return type, each error condition, and every step of the logic flow are mandatory — do not skip, reorder, rename, or approximate any of them.

#### Parameters

- **`cartId: string`** — The identifier of the cart that triggered the event.
- **`event: CheckoutEvent`** — The event type and timestamp to record.

#### Returns

`void`

#### Errors

Throw these exact error types under the described conditions only. Do not substitute, wrap, or rename them. For every error listed here, emit at least one regression test that fails without the guard and passes with it — a declared error with no corresponding test is an incomplete implementation:

- **`AppError(IO_ERROR)`** — Thrown if the audit log write fails.

#### Logic Flow

Implement the following logical sequence step-by-step without skipping any code validations:

1. Serialize the event with cartId and a UTC timestamp.
2. Write the serialized record to the audit log store.
3. If the write fails, wrap the underlying error and throw AppError(IO_ERROR).
