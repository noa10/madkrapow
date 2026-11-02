# GrabFood menu category IDs

Get Menu uses a category's configured GrabFood `external_category_id` when one exists. Otherwise it publishes the local category UUID as the category ID, so mapped products can appear without a separate category mapping. Keep the local category row when renaming a category: deleting and recreating it changes the UUID. Adding or changing an external category mapping also changes the published ID, so coordinate that change with the Grab menu sync. Product IDs still require a GrabFood product mapping.
