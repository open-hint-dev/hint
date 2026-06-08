## [VERIFICATION & UNIT TEST CRITERIA: applyCoupon]

Generate tests that explicitly cover every scenario listed below. Each edge case, mock data structure, and assertion described here must appear in the test output. Do not omit any scenario:

- Expired coupon: assert ExpiredCouponError is thrown when coupon date is in the past.
- Minimum order: assert MinimumOrderValueException is thrown when cart total < coupon threshold.
- Valid coupon: assert returned cart contains applied discount and correct total.
- Idempotency: applying the same coupon twice must throw without mutating the cart a second time.
