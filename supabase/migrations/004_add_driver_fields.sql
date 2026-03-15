-- Add driver information fields to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS driver_name TEXT,
ADD COLUMN IF NOT EXISTS driver_phone TEXT,
ADD COLUMN IF NOT EXISTS driver_plate_number TEXT;
