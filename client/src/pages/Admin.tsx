import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ImagePlus, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Artist, Auction, Lot, LotImage } from "@/lib/types";
import { money, moneyShort, dateTime } from "@/lib/format";
import { useToast } from "@/context/ToastContext";
import { ArtImage } from "@/components/ArtImage";
import { StatusBadge } from "@/components/StatusBadge";
import { PageLoader } from "@/components/common";
import { useConfig } from "@/components/BidPanel";

interface Overview {
  auctions: Array<Auction & { lotCount: number }>;
  artists: Artist[];
  stats: { users: number; bids: number; soldLots: number; soldTotal: number };
}

export default function Admin() {
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api.get<Overview>("/admin/overview") });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (overview.isLoading || !overview.data) return <PageLoader />;
  const { auctions, artists, stats } = overview.data;
  const current = selected ?? auctions[0]?.id ?? null;

  return (
    <div className="container-x py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="mt-2 text-5xl">Saleroom console</h1>
        </div>
        <button className="btn-primary" onClick={() => setCreating((c) => !c)}><Plus className="h-4 w-4" /> New auction</button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Registered users" value={stats.users.toLocaleString()} />
        <Stat label="Bids placed" value={stats.bids.toLocaleString()} />
        <Stat label="Lots sold" value={stats.soldLots.toLocaleString()} />
        <Stat label="Hammer total" value={moneyShort(stats.soldTotal)} />
      </div>

      {creating && <CreateAuction onDone={(id) => { setCreating(false); setSelected(id); }} />}

      <div className="mt-10 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-2">
          <p className="eyebrow mb-3">Auctions</p>
          {auctions.map((a) => (
            <button key={a.id} onClick={() => setSelected(a.id)} className={clsx("block w-full border p-4 text-left transition", a.id === current ? "border-gold bg-paper-card" : "border-ink/10 hover:border-ink/30")}>
              <div className="flex items-center justify-between gap-2"><StatusBadge status={a.status} /><span className="text-xs text-ink-muted">{a.lotCount} lots</span></div>
              <p className="mt-2 font-display text-lg leading-tight">{a.title}</p>
              <p className="mt-1 text-xs text-ink-muted">{dateTime(a.startsAt)}</p>
            </button>
          ))}
        </aside>
        <section>{current && <AuctionManager auctionId={current} artists={artists} />}</section>
      </div>
    </div>
  );
}

function CreateAuction({ onDone }: { onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const now = new Date();
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({
    title: "", subtitle: "", description: "", currency: "INR",
    startsAt: local(new Date(now.getTime() + 5 * 60000)),
    endsAt: local(new Date(now.getTime() + 2 * 3600000)),
    lotIntervalSeconds: 60, publish: true,
  });
  const m = useMutation({
    mutationFn: () => api.post<{ auction: Auction }>("/admin/auctions", { ...f, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), subtitle: f.subtitle || undefined, description: f.description || undefined }),
    onSuccess: ({ auction }) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["auctions"] });
      toast({ tone: "success", title: "Auction created" });
      onDone(auction.id);
    },
    onError: (e) => toast({ tone: "error", title: "Could not create auction", body: (e as ApiError).message }),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="mt-8 grid gap-4 border border-ink/10 bg-paper-card p-6 md:grid-cols-2">
      <F label="Title"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></F>
      <F label="Subtitle"><input className="input" value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></F>
      <F label="Bidding opens"><input type="datetime-local" className="input" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></F>
      <F label="First lot closes"><input type="datetime-local" className="input" required value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></F>
      <F label="Seconds between lot closes"><input type="number" min={0} max={3600} className="input" value={f.lotIntervalSeconds} onChange={(e) => setF({ ...f, lotIntervalSeconds: Number(e.target.value) })} /></F>
      <F label="Currency"><select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select></F>
      <F label="Description" className="md:col-span-2"><textarea rows={3} className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></F>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} /> Publish immediately (otherwise saved as draft)</label>
      <div className="flex justify-end md:col-span-1"><button className="btn-primary" disabled={m.isPending}>{m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create auction"}</button></div>
    </form>
  );
}

function AuctionManager({ auctionId, artists }: { auctionId: string; artists: Artist[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "auction", auctionId],
    queryFn: () => api.get<{ auction: Auction; lots: Array<Lot & { reservePrice: number | null }> }>(`/admin/auctions/${auctionId}`),
  });
  const [adding, setAdding] = useState(false);
  const publish = useMutation({
    mutationFn: () => api.patch(`/admin/auctions/${auctionId}/publish`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin"] }); toast({ tone: "success", title: "Auction published" }); },
  });
  const withdraw = useMutation({
    mutationFn: (lotId: string) => api.post(`/admin/lots/${lotId}/withdraw`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "auction", auctionId] }),
    onError: (e) => toast({ tone: "error", title: "Could not withdraw", body: (e as ApiError).message }),
  });

  if (isLoading || !data) return <PageLoader />;
  const { auction, lots } = data;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 pb-6">
        <div>
          <h2 className="text-3xl">{auction.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">Opens {dateTime(auction.startsAt)} · first close {dateTime(auction.endsAt)} · {auction.lotIntervalSeconds}s stagger</p>
        </div>
        <div className="flex gap-2">
          {auction.status === "DRAFT" && <button className="btn-gold" onClick={() => publish.mutate()}>Publish</button>}
          {auction.status !== "DRAFT" && <Link className="btn-outline" to={`/auctions/${auction.slug}`}>View public page</Link>}
          {auction.status !== "CLOSED" && <button className="btn-primary" onClick={() => setAdding((a) => !a)}><Plus className="h-4 w-4" /> Add lot</button>}
        </div>
      </div>

      {adding && <CreateLot auctionId={auctionId} artists={artists} currency={auction.currency} onDone={() => setAdding(false)} />}

      <div className="mt-6 space-y-4">
        {lots.length === 0 && <p className="text-sm text-ink-muted">No lots yet.</p>}
        {lots.map((l) => (
          <div key={l.id} className="grid gap-4 border border-ink/10 bg-paper-card p-4 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-3"><span className="eyebrow">Lot {l.lotNumber}</span><StatusBadge status={l.status} /></div>
              <p className="mt-1 font-display text-xl">{l.artist?.name} — <span className="italic">{l.title}</span></p>
              <p className="mt-1 text-xs text-ink-muted">
                Est. {money(l.estimateLow, auction.currency)}–{money(l.estimateHigh, auction.currency)} · Start {money(l.startingBid, auction.currency)} · Reserve {l.reservePrice ? money(l.reservePrice, auction.currency) : "none"} · Current {money(l.currentBid, auction.currency)} ({l.bidCount} bids) · Closes {dateTime(l.endsAt)}
              </p>
              <ImageManager lot={l} auctionId={auctionId} />
            </div>
            {(l.status === "LIVE" || l.status === "UPCOMING") && (
              <button className="btn-ghost self-start text-live" onClick={() => confirm(`Withdraw lot ${l.lotNumber}?`) && withdraw.mutate(l.id)}>Withdraw</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateLot({ auctionId, artists, currency, onDone }: { auctionId: string; artists: Artist[]; currency: string; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ title: "", artistId: artists[0]?.id ?? "", year: "", medium: "", dimensions: "", signature: "", description: "", provenance: "", estimateLow: "", estimateHigh: "", startingBid: "", reservePrice: "" });
  const [newArtist, setNewArtist] = useState("");
  const num = (s: string) => (s ? Number(s.replace(/[^\d]/g, "")) : undefined);
  const opt = (s: string) => s.trim() || undefined;

  const m = useMutation({
    mutationFn: async () => {
      let artistId = f.artistId;
      if (newArtist.trim()) artistId = (await api.post<{ artist: Artist }>("/admin/artists", { name: newArtist.trim() })).artist.id;
      return api.post("/admin/auctions/" + auctionId + "/lots", {
        title: f.title, artistId, year: opt(f.year), medium: opt(f.medium), dimensions: opt(f.dimensions), signature: opt(f.signature),
        description: opt(f.description), provenance: opt(f.provenance),
        estimateLow: num(f.estimateLow), estimateHigh: num(f.estimateHigh), startingBid: num(f.startingBid), reservePrice: num(f.reservePrice),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      toast({ tone: "success", title: "Lot added", body: "Now upload its images." });
      onDone();
    },
    onError: (e) => toast({ tone: "error", title: "Could not add lot", body: (e as ApiError).message }),
  });
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-6 grid gap-4 border border-gold/40 bg-paper-card p-6 md:grid-cols-3">
      <F label="Title" className="md:col-span-2"><input className="input" required value={f.title} onChange={s("title")} /></F>
      <F label="Artist">
        <select className="input" value={f.artistId} onChange={s("artistId")} disabled={!!newArtist}>{artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <input className="input mt-2" placeholder="…or new artist name" value={newArtist} onChange={(e) => setNewArtist(e.target.value)} />
      </F>
      <F label="Year"><input className="input" value={f.year} onChange={s("year")} /></F>
      <F label="Medium"><input className="input" value={f.medium} onChange={s("medium")} /></F>
      <F label="Dimensions"><input className="input" value={f.dimensions} onChange={s("dimensions")} /></F>
      <F label={`Low estimate (${currency})`}><input className="input" inputMode="numeric" required value={f.estimateLow} onChange={s("estimateLow")} /></F>
      <F label={`High estimate (${currency})`}><input className="input" inputMode="numeric" required value={f.estimateHigh} onChange={s("estimateHigh")} /></F>
      <F label={`Starting bid (${currency})`}><input className="input" inputMode="numeric" required value={f.startingBid} onChange={s("startingBid")} /></F>
      <F label={`Reserve (${currency}, hidden)`}><input className="input" inputMode="numeric" value={f.reservePrice} onChange={s("reservePrice")} /></F>
      <F label="Signature"><input className="input" value={f.signature} onChange={s("signature")} /></F>
      <div />
      <F label="Catalogue note" className="md:col-span-3"><textarea rows={3} className="input" value={f.description} onChange={s("description")} /></F>
      <F label="Provenance" className="md:col-span-3"><textarea rows={2} className="input" value={f.provenance} onChange={s("provenance")} /></F>
      <div className="flex justify-end gap-2 md:col-span-3">
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
        <button className="btn-primary" disabled={m.isPending}>{m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add lot"}</button>
      </div>
    </form>
  );
}

interface Signature {
  cloudName: string; apiKey: string; uploadUrl: string; timestamp: number; folder: string; eager: string; eager_async: boolean; signature: string;
}

/**
 * Signed direct upload: the browser sends the file straight to Cloudinary (no server bandwidth),
 * using a short-lived signature from our API, then registers the resulting public_id with the lot.
 */
function ImageManager({ lot, auctionId }: { lot: Lot; auctionId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: config } = useConfig();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "auction", auctionId] });

  const uploadOne = async (file: File) => {
    const sig = await api.get<Signature>(`/admin/uploads/signature?lotId=${lot.id}`);
    const body = new FormData();
    body.append("file", file);
    body.append("api_key", sig.apiKey);
    body.append("timestamp", String(sig.timestamp));
    body.append("folder", sig.folder);
    body.append("eager", sig.eager);
    body.append("eager_async", String(sig.eager_async));
    body.append("signature", sig.signature);
    const result = await new Promise<{ public_id: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", sig.uploadUrl);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress((p) => ({ ...p, [file.name]: Math.round((e.loaded / e.total) * 100) }));
      xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(JSON.parse(xhr.responseText)?.error?.message ?? "Upload failed")));
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(body);
    });
    await api.post(`/admin/lots/${lot.id}/images`, { publicId: result.public_id, alt: lot.title });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        setProgress((p) => ({ ...p, [file.name]: 0 }));
        await uploadOne(file);
      } catch (e) {
        toast({ tone: "error", title: `Upload failed: ${file.name}`, body: (e as Error).message });
      } finally {
        setProgress((p) => { const { [file.name]: _, ...rest } = p; return rest; });
      }
    }
    refresh();
    if (input.current) input.current.value = "";
  };

  const remove = useMutation({ mutationFn: (id: string) => api.del(`/admin/images/${id}`), onSuccess: refresh });
  const enabled = config?.cloudinary.enabled;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {(lot.images ?? []).map((img: LotImage) => (
        <div key={img.id} className="group relative h-20 w-20">
          <ArtImage image={img} width={160} fit="cover" className="h-full w-full" />
          <button onClick={() => img.id && remove.mutate(img.id)} className="absolute right-1 top-1 hidden bg-ink/80 p-1 text-paper group-hover:block" aria-label="Remove image"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {Object.entries(progress).map(([name, pct]) => (
        <div key={name} className="flex h-20 w-20 flex-col items-center justify-center border border-dashed border-gold text-xs text-gold-dark"><Upload className="h-4 w-4" />{pct}%</div>
      ))}
      <button
        disabled={!enabled}
        title={enabled ? "Upload images" : "Configure CLOUDINARY_* env vars on the server to enable uploads"}
        onClick={() => input.current?.click()}
        className={clsx("flex h-20 w-20 flex-col items-center justify-center gap-1 border border-dashed text-[10px] uppercase tracking-wider", enabled ? "border-ink/30 text-ink-muted hover:border-gold hover:text-gold-dark" : "cursor-not-allowed border-ink/10 text-ink-muted/50")}
      >
        <ImagePlus className="h-5 w-5" /> {enabled ? "Upload" : "No Cloudinary"}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/tiff,image/avif" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
    </div>
  );
}

function F({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-paper-card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
    </div>
  );
}
