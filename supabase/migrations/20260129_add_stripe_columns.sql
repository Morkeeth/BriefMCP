-- Add Stripe billing columns to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Create index for faster Stripe lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
ON organizations(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_subscription_id
ON organizations(stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN organizations.stripe_customer_id IS 'Stripe Customer ID for billing';
COMMENT ON COLUMN organizations.stripe_subscription_id IS 'Stripe Subscription ID for the Pro plan';
