import { Link } from "react-router-dom";
import { useConfig } from "@/components/BidPanel";

export default function HowToBid() {
  const { data } = useConfig();
  const r = data?.rules;
  const steps = [
    ["Register", "Create a free account. You'll be assigned a private paddle number — other bidders only ever see this number, never your name."],
    ["Browse & inspect", "Open any lot and use the high-resolution viewer to zoom into brushwork, surface and signature before you bid."],
    ["Bid live", "Choose the next increment or enter your own amount. Every bid is confirmed instantly and broadcast to all bidders in real time."],
    ["Or leave a maximum", "Set a confidential maximum and our system bids for you, one increment at a time, only as far as needed to keep you in the lead."],
    ["Soft close", `Lots close one after another. Any bid in the final ${Math.round((r?.softCloseWindowSeconds ?? 120) / 60)} minutes extends that lot by ${Math.round((r?.softCloseExtensionSeconds ?? 120) / 60)} minutes, so no one can be sniped.`],
    ["Win & collect", "If you are the highest bidder when the lot closes and the reserve is met, the lot is yours. We'll send your invoice and arrange insured shipping."],
  ];
  return (
    <div className="container-x py-14">
      <p className="eyebrow">Buying at Atelier</p>
      <h1 className="mt-2 text-5xl md:text-6xl">How to bid</h1>
      <ol className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-3">
        {steps.map(([t, b], i) => (
          <li key={t} className="border-t border-ink/15 pt-6">
            <span className="font-display text-5xl text-gold">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="mt-3 text-2xl">{t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{b}</p>
          </li>
        ))}
      </ol>
      <section id="premium" className="mt-20 max-w-3xl border border-ink/10 bg-paper-card p-8">
        <h2 className="text-3xl">Buyer's premium</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          A buyer's premium of {r?.buyersPremiumPercent ?? 20}% is added to the hammer price of each lot. Applicable taxes and shipping are added on the invoice. Reserve prices are confidential; a lot marked “reserve not met” will not sell below its reserve.
        </p>
        <Link to="/auctions" className="btn-primary mt-6">Browse live auctions</Link>
      </section>
    </div>
  );
}
