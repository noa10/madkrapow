/**
 * Quantity bounds shared by the ordering UI and the checkout schema, so a
 * client bug or crafted payload cannot submit an absurd quantity to Stripe.
 */
export const MIN_ITEM_QUANTITY = 1
export const MAX_ITEM_QUANTITY = 10
