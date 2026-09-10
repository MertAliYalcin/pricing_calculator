import { getDraftView } from "@/lib/estimate";
import { getSavedEstimates } from "@/lib/estimates";
import { CartView } from "@/components/cart/cart-view";
import { PageHeader } from "@/components/page-header";

export default async function CartPage() {
  const [draft, savedEstimates] = await Promise.all([getDraftView(), getSavedEstimates()]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader
        eyebrow="Working draft"
        title="Current estimate"
        note="Priced against today's parameters. Numbers move until you save."
      />
      <CartView draft={draft} savedEstimates={savedEstimates} />
    </div>
  );
}
