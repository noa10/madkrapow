-- Backfill avatar_url for existing customers who signed in with Google OAuth
-- but don't have an avatar_url set in the customers table.
-- Supabase stores Google's profile picture in auth.users.raw_user_meta_data
-- as either 'avatar_url' (Supabase convention) or 'picture' (Google's original field).
UPDATE customers c
SET avatar_url = COALESCE(
  au.raw_user_meta_data->>'avatar_url',
  au.raw_user_meta_data->>'picture'
)
FROM auth.users au
WHERE c.auth_user_id = au.id
  AND c.avatar_url IS NULL
  AND (
    au.raw_user_meta_data->>'avatar_url' IS NOT NULL
    OR au.raw_user_meta_data->>'picture' IS NOT NULL
  );
