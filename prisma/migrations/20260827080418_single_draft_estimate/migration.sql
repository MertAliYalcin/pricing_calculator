-- Enforce at most one draft estimate at a time (the cart is always exactly one draft row).
CREATE UNIQUE INDEX "estimates_single_draft" ON "estimates" ((status)) WHERE status = 'draft';
